module Clinic
  module Billing
    class DraftInvoice
      def self.call(practice:, actor:, patient:, currency:, lines:)
        Authorization.authorize!(actor: actor, practice: practice, action: "billing.write")
        patient = practice.patients.find(patient.id)
        currency = currency.to_s
        raise ArgumentError, "Currency must be a three-letter uppercase code." unless currency.match?(/\A[A-Z]{3}\z/)
        raise ArgumentError, "An invoice needs at least one line." unless lines.is_a?(Array) && lines.any?

        ApplicationRecord.transaction do
          invoice = practice.invoices.create!(patient: patient, currency: currency, status: "draft", rounding_policy_version: Money::POLICY_VERSION)
          lines.each do |line|
            quantity = Money.decimal(line.fetch(:quantity), name: "quantity", positive: true)
            unit_amount = Money.decimal(line.fetch(:unit_amount), name: "unit amount")
            invoice.lines.create!(
              practice: practice,
              patient: patient,
              quantity: quantity,
              unit_amount: unit_amount,
              posted_amount: Money.line_total(quantity: quantity, unit_amount: unit_amount),
              description_snapshot: line.fetch(:description_snapshot).to_s
            )
          end
          invoice
        end
      end
    end
  end
end
