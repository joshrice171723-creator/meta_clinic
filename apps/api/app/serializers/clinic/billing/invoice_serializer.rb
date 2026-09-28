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
          created_at: invoice.created_at,
          updated_at: invoice.updated_at.iso8601(6)
        }
        total = invoice.lines.sum { |line| line.posted_amount || 0 }
        allocated = invoice.payment_allocations.sum { |allocation| allocation.amount || 0 }
        credit = invoice.credit_notes.sum { |note| note.amount || 0 }
        balance = invoice.status == "void" ? BigDecimal("0") : [ total - allocated - credit, BigDecimal("0") ].max
        payload.merge!(
          total_amount: total.to_d.to_s("F"),
          allocated_amount: allocated.to_d.to_s("F"),
          credit_amount: credit.to_d.to_s("F"),
          balance_amount: balance.to_d.to_s("F"),
          adjustment_limits: InvoiceAdjustments.limits(invoice),
          online_payment: online_payment(invoice)
        )
        return payload unless detail

        payload.merge(
          lines: invoice.lines.order(:id).map { |line|
            {
              id: line.id,
              quantity: line.quantity.to_s("F"),
              unit_amount: line.unit_amount.to_s("F"),
              posted_amount: line.posted_amount.to_s("F"),
              billing_service_id: line.billing_service_id,
              description: line.description_snapshot
            }
          },
          credits: invoice.credit_notes.order(:id).map { |note| credit(note) },
          allocated_amount: allocated.to_d.to_s("F"),
          credit_amount: credit.to_d.to_s("F"),
          void_reason: invoice.void_reason,
          voided_at: invoice.voided_at&.iso8601,
          voided_by_membership_id: invoice.voided_by_membership_id,
          audit_timeline: audit_timeline(invoice)
        )
      end

      def self.online_payment(invoice, result: nil, include_checkout_url: false)
        payload = StripeInvoicePayments.eligibility(invoice: invoice)
        payload[:checkout_url] = result.checkout_url if include_checkout_url && result&.checkout_url
        payload
      end

      def self.credit(note)
        {
          id: note.id,
          invoice_id: note.invoice_id,
          amount: note.amount.to_s("F"),
          currency: note.currency,
          adjustment_type: note.adjustment_type,
          reason: note.reason,
          issued_at: (note.issued_at || note.created_at).iso8601,
          issued_by_membership_id: note.issued_by_membership_id
        }
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
