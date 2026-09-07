module Clinic
  module Billing
    module InvoiceSerializer
      def self.call(invoice, detail: false)
        payload = {
          id: invoice.id,
          patient_id: invoice.patient_id,
          encounter_id: invoice.encounter_id,
          currency: invoice.currency,
          status: invoice.status,
          rounding_policy_version: invoice.rounding_policy_version,
          created_at: invoice.created_at
        }
        total = invoice.lines.sum { |line| line.posted_amount || 0 }
        allocated = invoice.payment_allocations.sum { |allocation| allocation.amount || 0 }
        credit = invoice.credit_notes.sum { |note| note.amount || 0 }
        payload.merge!(
          total_amount: total.to_d.to_s("F"),
          allocated_amount: allocated.to_d.to_s("F"),
          credit_amount: credit.to_d.to_s("F"),
          balance_amount: (total - allocated - credit).to_d.to_s("F")
        )
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
          allocated_amount: allocated.to_d.to_s("F"),
          credit_amount: credit.to_d.to_s("F"),
          audit_timeline: audit_timeline(invoice)
        )
      end

      def self.audit_timeline(invoice)
        Clinic::ModelVersion.for_practice(invoice.practice_id)
          .for_subject(invoice)
          .order(occurred_at: :desc, id: :desc)
          .limit(25)
          .map do |version|
            {
              id: version.id,
              event: version.event,
              actor_reference: version.actor_reference,
              changed_fields: version.changed_fields,
              occurred_at: version.occurred_at.iso8601
            }
          end
      end
      private_class_method :audit_timeline
    end
  end
end
