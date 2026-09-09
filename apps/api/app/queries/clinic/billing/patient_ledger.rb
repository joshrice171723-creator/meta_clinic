module Clinic
  module Billing
    class PatientLedger
      def self.call(practice:, patient:, include_adjustment_evidence: false)
        new(practice:, patient:, include_adjustment_evidence:).call
      end

      def initialize(practice:, patient:, include_adjustment_evidence:)
        @practice = practice
        @patient = patient
        @include_adjustment_evidence = include_adjustment_evidence
      end

      def call
        invoices = @patient.invoices.includes(
          :lines,
          :payment_allocations,
          :credit_notes,
          invoice_stripe_checkouts: :collection_intent
        ).order(created_at: :desc, id: :desc).to_a
        payments = Clinic::PaymentEvent.where(practice: @practice, patient: @patient).includes(:allocations, :refund_events, :cash_tender, :billing_receipts).order(created_at: :desc, id: :desc).to_a
        preload_adjustment_memberships(invoices) if @include_adjustment_evidence

        {
          schema_version: "clinic-patient-ledger-v1",
          patient: { id: @patient.id, display_name: @patient.display_name, reference: @patient.reference },
          currencies: currency_summaries(invoices, payments),
          invoices: invoices.map { |invoice| invoice_payload(invoice) },
          payments: payments.map { |payment| payment_payload(payment) }
        }
      end

      private

      def currency_summaries(invoices, payments)
        currencies = (invoices.map(&:currency) + payments.map(&:currency)).uniq.sort
        currencies.map do |currency|
          currency_invoices = invoices.select { |invoice| invoice.currency == currency }
          currency_payments = payments.select { |payment| payment.currency == currency }
          {
            currency: currency,
            invoiced_amount: decimal(currency_invoices.sum { |invoice| invoice_total(invoice) }),
            allocated_amount: decimal(currency_invoices.sum { |invoice| invoice_allocated(invoice) }),
            credited_amount: decimal(currency_invoices.sum { |invoice| invoice_credit(invoice) }),
            balance_amount: decimal(currency_invoices.sum { |invoice| invoice_balance(invoice) }),
            refunded_amount: decimal(currency_payments.sum { |payment| payment.refund_events.sum(&:amount) })
          }
        end
      end

      def invoice_payload(invoice)
        payload = {
          id: invoice.id,
          currency: invoice.currency,
          status: invoice.status,
          created_at: invoice.created_at.iso8601,
          updated_at: invoice.updated_at.iso8601(6),
          total_amount: decimal(invoice.lines.sum(&:posted_amount)),
          allocated_amount: decimal(invoice_allocated(invoice)),
          credit_amount: decimal(invoice_credit(invoice)),
          balance_amount: decimal(invoice_balance(invoice)),
          adjustment_limits: InvoiceAdjustments.limits(invoice),
          online_payment: InvoiceSerializer.online_payment(invoice),
          lines: invoice.lines.sort_by(&:id).map do |line|
            { id: line.id, description: line.description_snapshot, quantity: decimal(line.quantity), unit_amount: decimal(line.unit_amount), posted_amount: decimal(line.posted_amount), billing_service_id: line.billing_service_id }
          end,
          allocations: invoice.payment_allocations.sort_by(&:created_at).map do |allocation|
            { id: allocation.id, payment_event_id: allocation.payment_event_id, amount: decimal(allocation.amount), created_at: allocation.created_at.iso8601 }
          end,
          credits: invoice.credit_notes.sort_by(&:created_at).map do |credit|
            credit_payload(credit)
          end
        }
        if @include_adjustment_evidence
          payload.merge!(
            void_reason: invoice.void_reason,
            voided_at: invoice.voided_at&.iso8601,
            voided_by: membership_name(invoice.voided_by_membership_id)
          )
        end
        payload
      end

      def credit_payload(credit)
        payload = { id: credit.id, amount: decimal(credit.amount), created_at: credit.created_at.iso8601 }
        return payload unless @include_adjustment_evidence

        payload.merge(
          currency: credit.currency,
          reason: credit.reason,
          issued_at: (credit.issued_at || credit.created_at).iso8601,
          issued_by: membership_name(credit.issued_by_membership_id)
        )
      end

      def membership_name(membership_id)
        return nil if membership_id.nil?

        @membership_names[membership_id]
      end

      def preload_adjustment_memberships(invoices)
        membership_ids = invoices.flat_map do |invoice|
          [ invoice.voided_by_membership_id, *invoice.credit_notes.map(&:issued_by_membership_id) ]
        end.compact.uniq
        @membership_names = {}
        return if membership_ids.empty?

        @membership_names = Clinic::Membership.where(practice: @practice, id: membership_ids)
          .includes(:user).index_by(&:id).transform_values do |membership|
            membership.user.email_address.split("@").first.tr("._-", " ").titleize
          end
      end

      def payment_payload(payment)
        allocated = payment.allocations.sum(&:amount)
        refunded = payment.refund_events.sum(&:amount)
        {
          id: payment.id,
          currency: payment.currency,
          amount: decimal(payment.amount),
          allocated_amount: decimal(allocated),
          unapplied_amount: decimal([payment.amount - allocated - refunded, BigDecimal("0")].max),
          created_at: payment.created_at.iso8601,
          cash_payment: payment.cash_tender.present?,
          receipt_available: payment.billing_receipts.any?,
          allocations: payment.allocations.sort_by(&:created_at).map do |allocation|
            { id: allocation.id, invoice_id: allocation.invoice_id, amount: decimal(allocation.amount), created_at: allocation.created_at.iso8601 }
          end,
          refunds: payment.refund_events.sort_by(&:created_at).map do |refund|
            { id: refund.id, amount: decimal(refund.amount), reason: refund.reason, created_at: refund.created_at.iso8601 }
          end
        }
      end

      def invoice_total(invoice)
        return BigDecimal("0") unless invoice.status == "posted"

        invoice.lines.sum(&:posted_amount)
      end

      def invoice_allocated(invoice)
        return BigDecimal("0") unless invoice.status == "posted"

        invoice.payment_allocations.sum(&:amount)
      end

      def invoice_credit(invoice)
        return BigDecimal("0") unless invoice.status == "posted"

        invoice.credit_notes.sum(&:amount)
      end

      def invoice_balance(invoice)
        [invoice_total(invoice) - invoice_allocated(invoice) - invoice_credit(invoice), BigDecimal("0")].max
      end

      def decimal(value)
        BigDecimal(value.to_s).to_s("F")
      end
    end
  end
end
