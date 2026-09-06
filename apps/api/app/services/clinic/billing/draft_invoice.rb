module Clinic
  module Billing
    class DraftInvoice
      OPERATION_CODE = "billing.invoice_draft"

      def self.call(practice:, actor:, patient:, currency:, lines:, created_at: nil, request_key: nil)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.invoice_draft", legacy_action: "billing.write")
        patient = practice.patients.find(patient.id)
        currency = currency.to_s
        raise ArgumentError, "Currency must be a three-letter uppercase code." unless currency.match?(/\A[A-Z]{3}\z/)
        raise ArgumentError, "An invoice needs at least one line." unless lines.is_a?(Array) && lines.any?

        normalized_lines = lines.map do |line|
          quantity = Money.decimal(line.fetch(:quantity), name: "quantity", positive: true)
          unit_amount = Money.decimal(line.fetch(:unit_amount), name: "unit amount")
          {
            quantity: quantity.to_s("F"),
            unit_amount: unit_amount.to_s("F"),
            posted_amount: Money.line_total(quantity: quantity, unit_amount: unit_amount),
            description_snapshot: line.fetch(:description_snapshot).to_s
          }
        end
        key = request_key || SecureRandom.uuid
        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: OPERATION_CODE,
          request_key: key,
          payload: {
            patient_id: patient.id,
            currency: currency,
            created_at: created_at,
            lines: normalized_lines.map { |line| line.except(:posted_amount) }
          },
          authorization: -> {
            Authorization.authorize_with_legacy!(actor: actor, practice: practice,
              action: "billing.invoice_draft", legacy_action: "billing.write")
          },
          authorization_action: "billing.invoice_draft",
          result_resource: ->(invoice) { invoice },
          resource_resolver: ->(practice:, receipt:) {
            practice.invoices.find_by(id: receipt.resource_id, patient_id: patient.id)
          }
        ) do
          timestamp_attributes = created_at ? { created_at: created_at, updated_at: created_at } : {}
          invoice = practice.invoices.create!(timestamp_attributes.merge(patient: patient, currency: currency, status: "draft", rounding_policy_version: Money::POLICY_VERSION))
          normalized_lines.each do |line|
            invoice.lines.create!(timestamp_attributes.merge(
              practice: practice,
              patient: patient,
              quantity: line.fetch(:quantity),
              unit_amount: line.fetch(:unit_amount),
              posted_amount: line.fetch(:posted_amount),
              description_snapshot: line.fetch(:description_snapshot)
            ))
          end
          invoice
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed invoice is unavailable.")
      end
    end
  end
end
