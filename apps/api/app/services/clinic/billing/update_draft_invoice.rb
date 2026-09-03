module Clinic
  module Billing
    class UpdateDraftInvoice
      def self.call(practice:, actor:, invoice:, currency:, lines:)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.invoice_draft", legacy_action: "billing.write")
        invoice = practice.invoices.lock.find(invoice.id)
        raise ArgumentError, "Only draft invoices can be edited." unless invoice.status == "draft"
        patient = practice.patients.find(invoice.patient_id)
        raise ArgumentError, "An invoice needs at least one line." unless lines.is_a?(Array) && lines.any?
        currency = currency.to_s
        raise ArgumentError, "Currency must be a three-letter uppercase code." unless currency.match?(/\A[A-Z]{3}\z/)

        ApplicationRecord.transaction do
          invoice.update!(currency: currency)
          invoice.lines.to_a.each(&:destroy!)
          lines.each do |line|
            quantity = Money.decimal(line.fetch(:quantity), name: "quantity", positive: true)
            unit_amount = Money.decimal(line.fetch(:unit_amount), name: "unit amount")
            invoice.lines.create!(
              practice: practice, patient: patient, quantity: quantity, unit_amount: unit_amount,
              posted_amount: Money.line_total(quantity: quantity, unit_amount: unit_amount),
              description_snapshot: line.fetch(:description_snapshot).to_s
            )
          end
          invoice.reload
        end
      end
    end
  end
end
