module Clinic
  module Billing
    class UpdateDraftInvoice
      def self.call(practice:, actor:, invoice:, currency:, lines:, request_key:, expected_updated_at:)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.invoice_draft", legacy_action: "billing.write")
        currency = currency.to_s
        raise ArgumentError, "Currency must be a three-letter uppercase code." unless currency.match?(/\A[A-Z]{3}\z/)
        requested_lines = InvoiceLineInput.normalize(lines)

        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: "billing.invoice_draft_update",
          request_key: request_key,
          resource: invoice,
          authorization_action: "billing.invoice_draft",
          authorization: lambda {
            Authorization.authorize_with_legacy!(actor: actor, practice: practice,
              action: "billing.invoice_draft", legacy_action: "billing.write")
          },
          payload: {
            invoice_id: invoice.id,
            patient_id: invoice.patient_id,
            encounter_id: invoice.encounter_id,
            currency: currency,
            lines: requested_lines,
            expected_updated_at: expected_updated_at
          },
          result_resource: ->(value) { value },
          resource_resolver: lambda { |practice:, receipt:|
            practice.invoices.find_by(id: receipt.resource_id, patient_id: invoice.patient_id,
              encounter_id: invoice.encounter_id)
          }
        ) do
          invoice = practice.invoices.lock.find(invoice.id)
          raise ArgumentError, "Only draft invoices can be edited." unless invoice.status == "draft"
          unless ActiveSupport::SecurityUtils.secure_compare(invoice.updated_at.utc.iso8601(6), expected_updated_at.to_s)
            raise ActiveRecord::StaleObjectError.new(invoice, "update")
          end
          patient = practice.patients.find(invoice.patient_id)
          normalized_lines = InvoiceLineInput.resolve!(practice: practice, currency: currency, lines: requested_lines, invoice: invoice)
          invoice.update!(currency: currency)
          invoice.lines.to_a.each(&:destroy!)
          normalized_lines.each do |line|
            attributes = {
              practice: practice,
              patient: patient,
              quantity: line.fetch(:quantity),
              unit_amount: line.fetch(:unit_amount),
              posted_amount: line.fetch(:posted_amount),
              description_snapshot: line.fetch(:description_snapshot)
            }
            attributes[:billing_service_id] = line[:billing_service_id] if line[:billing_service_id]
            invoice.lines.create!(attributes)
          end
          invoice.touch
          invoice.reload
        end

        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
