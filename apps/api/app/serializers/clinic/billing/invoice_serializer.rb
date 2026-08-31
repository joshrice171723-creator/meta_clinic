module Clinic
  module Billing
    module InvoiceSerializer
      def self.call(invoice, detail: false)
        payload = {
          id: invoice.id,
          patient_id: invoice.patient_id,
          currency: invoice.currency,
          status: invoice.status,
          rounding_policy_version: invoice.rounding_policy_version,
          created_at: invoice.created_at
        }
        return payload unless detail

        payload.merge(
          lines: invoice.lines.order(:id).map { |line|
            {
              id: line.id,
              quantity: line.quantity.to_s("F"),
              unit_amount: line.unit_amount.to_s("F"),
              posted_amount: line.posted_amount.to_s("F"),
              description: line.description_snapshot
            }
          },
          allocated_amount: invoice.payment_allocations.sum(:amount).to_s("F"),
          credit_amount: invoice.credit_notes.sum(:amount).to_s("F")
        )
      end
    end
  end
end
