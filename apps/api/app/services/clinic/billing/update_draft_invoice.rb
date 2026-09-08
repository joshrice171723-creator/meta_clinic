module Clinic
  module Billing
    class UpdateDraftInvoice
      def self.call(practice:, actor:, invoice:, currency:, lines:)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.invoice_draft", legacy_action: "billing.write")
        currency = currency.to_s
        raise ArgumentError, "Currency must be a three-letter uppercase code." unless currency.match?(/\A[A-Z]{3}\z/)
        requested_lines = InvoiceLineInput.normalize(lines)

        ApplicationRecord.transaction do
          invoice = practice.invoices.lock.find(invoice.id)
          raise ArgumentError, "Only draft invoices can be edited." unless invoice.status == "draft"
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
      end
    end
  end
end
