module Clinic
  module Billing
    class DraftInvoice
      OPERATION_CODE = "billing.invoice_draft"

      def self.call(practice:, actor:, patient:, currency:, lines:, encounter: nil, created_at: nil, request_key: nil)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.invoice_draft", legacy_action: "billing.write")
        patient = practice.patients.find(patient.id)
        encounter = practice.encounters.where(patient_id: patient.id).find(encounter.id) if encounter
        validate_checkout_encounter!(encounter) if encounter
        currency = currency.to_s
        raise ArgumentError, "Currency must be a three-letter uppercase code." unless currency.match?(/\A[A-Z]{3}\z/)
        requested_lines = InvoiceLineInput.normalize(lines)
        key = request_key || SecureRandom.uuid
        idempotency_payload = {
          patient_id: patient.id,
          currency: currency,
          created_at: created_at,
          lines: requested_lines
        }
        idempotency_payload[:encounter_id] = encounter.id if encounter
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: OPERATION_CODE,
          request_key: key,
          payload: idempotency_payload,
          authorization: -> {
            Authorization.authorize_with_legacy!(actor: actor, practice: practice,
              action: "billing.invoice_draft", legacy_action: "billing.write")
          },
          authorization_action: "billing.invoice_draft",
          result_resource: ->(invoice) { invoice },
          resource_resolver: ->(practice:, receipt:) {
            practice.invoices.find_by(id: receipt.resource_id, patient_id: patient.id, encounter_id: encounter&.id)
          }
        ) do
          normalized_lines = InvoiceLineInput.resolve!(practice: practice, currency: currency, lines: requested_lines)
          if encounter
            locked_encounter = practice.encounters.where(patient_id: patient.id).lock.find(encounter.id)
            validate_checkout_encounter!(locked_encounter)
            current = practice.invoices.where(patient_id: patient.id, encounter_id: locked_encounter.id).where.not(status: "void").first
            if current
              unless same_invoice_request?(current, currency: currency, lines: normalized_lines)
                raise ArgumentError, "This encounter already has an active checkout invoice with different details. Open that invoice instead."
              end
              next current
            end
            encounter = locked_encounter
          end

          timestamp_attributes = created_at ? { created_at: created_at, updated_at: created_at } : {}
          invoice = practice.invoices.create!(timestamp_attributes.merge(patient: patient, encounter: encounter,
            currency: currency, status: "draft", rounding_policy_version: Money::POLICY_VERSION))
          normalized_lines.each do |line|
            line_attributes = {
              practice: practice,
              patient: patient,
              quantity: line.fetch(:quantity),
              unit_amount: line.fetch(:unit_amount),
              posted_amount: line.fetch(:posted_amount),
              description_snapshot: line.fetch(:description_snapshot)
            }
            line_attributes[:billing_service_id] = line[:billing_service_id] if line[:billing_service_id]
            invoice.lines.create!(timestamp_attributes.merge(line_attributes))
          end
          invoice
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed invoice is unavailable.")
      end

      def self.validate_checkout_encounter!(encounter)
        return unless encounter
        return if encounter.status == "completed" && encounter.ended_at.present?

        raise ArgumentError, "Complete the encounter before starting checkout."
      end
      private_class_method :validate_checkout_encounter!

      def self.same_invoice_request?(invoice, currency:, lines:)
        existing_lines = invoice.lines.order(:id).map do |line|
          attributes = {
            quantity: line.quantity.to_s("F"),
            unit_amount: line.unit_amount.to_s("F"),
            description_snapshot: line.description_snapshot.to_s
          }
          attributes[:billing_service_id] = line.billing_service_id if line.billing_service_id
          attributes
        end
        requested_lines = lines.map { |line| line.slice(:quantity, :unit_amount, :description_snapshot, :billing_service_id) }
        invoice.currency == currency && existing_lines == requested_lines
      end
      private_class_method :same_invoice_request?
    end
  end
end
