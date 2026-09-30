module Clinic
  module Billing
    class EstimateInvoiceComparison
      def self.call(practice:, patient:, estimate_id:, invoice_id:)
        patient = practice.patients.find(patient.id)
        estimate = CashPayEstimate.where(practice: practice, patient: patient).includes(:lines).find(estimate_id)
        invoice = practice.invoices.where(patient: patient).includes(:lines).find(invoice_id)
        unless estimate.status.in?(%w[issued superseded]) && estimate.issued_at.present?
          raise ArgumentError, "Choose an issued estimate snapshot for comparison."
        end
        raise ArgumentError, "Choose a posted invoice for comparison." unless invoice.status == "posted"
        raise ArgumentError, "The invoice and estimate must use the same currency." unless invoice.currency == estimate.currency

        expected = estimate.lines.sum(BigDecimal("0"), &:expected_amount)
        posted = invoice.lines.sum(BigDecimal("0"), &:posted_amount)
        {
          schema_version: "estimate-invoice-comparison-v1",
          patient_id: patient.id,
          currency: estimate.currency,
          generated_at: Time.current.iso8601(6),
          comparison_basis: "posted_charges_before_payments_and_credits",
          difference_amount: (posted - expected).to_s("F"),
          estimate: {
            id: estimate.id, revision: estimate.revision, status: estimate.status, issued_at: estimate.issued_at.iso8601(6),
            total_amount: expected.to_s("F"),
            lines: estimate.lines.sort_by(&:id).map { |line|
              { id: line.id, description: line.description_snapshot, quantity: line.quantity.to_s("F"),
                unit_amount: line.unit_amount.to_s("F"), expected_amount: line.expected_amount.to_s("F"),
                inclusions: line.inclusions, exclusions: line.exclusions }
            }
          },
          invoice: {
            id: invoice.id, status: invoice.status, created_at: invoice.created_at.iso8601(6),
            updated_at: invoice.updated_at.iso8601(6), total_amount: posted.to_s("F"),
            lines: invoice.lines.sort_by(&:id).map { |line|
              { id: line.id, description: line.description_snapshot, quantity: line.quantity.to_s("F"),
                unit_amount: line.unit_amount.to_s("F"), posted_amount: line.posted_amount.to_s("F") }
            }
          }
        }
      end
    end
  end
end
