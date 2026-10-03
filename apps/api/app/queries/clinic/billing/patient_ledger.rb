module Clinic
  module Billing
    class PatientLedger
      HISTORY_LIMIT = 20

      def self.call(practice:, patient:, include_adjustment_evidence: false, history_limit: nil)
        new(practice:, patient:, include_adjustment_evidence:, history_limit:).call
      end

      def self.history_page(practice:, patient:, kind:, before: nil)
        new(practice:, patient:, include_adjustment_evidence: false, history_limit: HISTORY_LIMIT)
          .history_page(kind:, before:)
      end

      def initialize(practice:, patient:, include_adjustment_evidence:, history_limit:)
        @practice = practice
        @patient = patient
        @include_adjustment_evidence = include_adjustment_evidence
        @history_limit = history_limit
      end

      def call
        invoices, invoice_cursor = invoice_page
        payments, payment_cursor = payment_page
        preload_adjustment_memberships(invoices) if @include_adjustment_evidence

        {
          schema_version: "clinic-patient-ledger-v1",
          patient: { id: @patient.id, display_name: @patient.display_name, reference: @patient.reference },
          currencies: currency_summaries,
          invoices: invoices.map { |invoice| invoice_payload(invoice) },
          payments: payments.map { |payment| payment_payload(payment) },
          pagination: {
            invoices: { next_cursor: invoice_cursor },
            payments: { next_cursor: payment_cursor }
          }
        }
      end

      def history_page(kind:, before: nil)
        records, next_cursor = case kind
        when "invoices" then invoice_page(before:)
        when "payments" then payment_page(before:)
        else raise ArgumentError, "History kind must be invoices or payments."
        end
        items = kind == "invoices" ? records.map { |invoice| invoice_payload(invoice) } : records.map { |payment| payment_payload(payment) }
        {
          schema_version: "patient-portal-billing-history-v1",
          patient_id: @patient.id,
          kind: kind,
          items: items,
          next_cursor: next_cursor
        }
      end

      private

      def currency_summaries
        posted_invoices = @patient.invoices.where(practice: @practice, status: "posted")
        invoice_totals = Clinic::InvoiceLine.joins(:invoice).merge(posted_invoices)
          .group("clinic_invoices.currency").sum(:posted_amount)
        allocated_totals = Clinic::PaymentAllocation.joins(:invoice).merge(posted_invoices)
          .group("clinic_invoices.currency").sum(:amount)
        credit_totals = Clinic::CreditNote.joins(:invoice).merge(posted_invoices)
          .group("clinic_invoices.currency").sum(:amount)
        balance_totals = posted_invoices.group(:currency).sum(Arel.sql(Dashboard::OUTSTANDING_BALANCE_SQL))
        refund_totals = Clinic::RefundEvent.joins(:payment_event)
          .merge(Clinic::PaymentEvent.where(practice: @practice, patient: @patient))
          .group("clinic_payment_events.currency").sum(:amount)
        currencies = (
          @patient.invoices.where(practice: @practice).distinct.pluck(:currency) +
          Clinic::PaymentEvent.where(practice: @practice, patient: @patient).distinct.pluck(:currency)
        ).uniq.sort
        currencies.map do |currency|
          invoiced = invoice_totals.fetch(currency, BigDecimal("0"))
          allocated = allocated_totals.fetch(currency, BigDecimal("0"))
          credited = credit_totals.fetch(currency, BigDecimal("0"))
          {
            currency: currency,
            invoiced_amount: decimal(invoiced),
            allocated_amount: decimal(allocated),
            credited_amount: decimal(credited),
            balance_amount: decimal(balance_totals.fetch(currency, BigDecimal("0"))),
            refunded_amount: decimal(refund_totals.fetch(currency, BigDecimal("0")))
          }
        end
      end

      def invoice_page(before: nil)
        relation = @patient.invoices.where(practice: @practice)
          .includes(:lines, :payment_allocations, :credit_notes, encounter: :site, invoice_stripe_checkouts: :collection_intent)
        bounded_page(relation, before:)
      end

      def payment_page(before: nil)
        relation = Clinic::PaymentEvent.where(practice: @practice, patient: @patient)
          .includes(:refund_events, :billing_receipts, allocations: { invoice: { encounter: :site } }, cash_tender: :cash_drawer_session)
        bounded_page(relation, before:)
      end

      def bounded_page(relation, before:)
        relation = relation.where("#{relation.klass.table_name}.id < ?", before) if before
        return [ relation.order(id: :desc).to_a, nil ] unless @history_limit

        rows = relation.order(id: :desc).limit(@history_limit + 1).to_a
        more = rows.length > @history_limit
        records = rows.first(@history_limit)
        [ records, more ? records.last.id : nil ]
      end

      def invoice_payload(invoice)
        payload = {
          id: invoice.id,
          encounter_id: invoice.encounter_id,
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
        }.merge(InvoiceSerializer.source_location(invoice))
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
        payload = { id: credit.id, amount: decimal(credit.amount), adjustment_type: credit.adjustment_type,
          created_at: credit.created_at.iso8601 }
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
        cash_refund_unavailable_reason = if payment.cash_tender.nil?
          "not_cash_payment"
        elsif payment.cash_tender.cash_drawer_session.status != "open"
          "cash_drawer_closed"
        elsif refunded >= payment.amount
          "payment_fully_refunded"
        end
        {
          id: payment.id,
          source_sites: InvoiceSerializer.payment_source_sites(payment),
          currency: payment.currency,
          amount: decimal(payment.amount),
          allocated_amount: decimal(allocated),
          unapplied_amount: decimal([payment.amount - allocated - refunded, BigDecimal("0")].max),
          created_at: payment.created_at.iso8601,
          cash_payment: payment.cash_tender.present?,
          cash_refund_available: cash_refund_unavailable_reason.nil?,
          cash_refund_unavailable_reason: cash_refund_unavailable_reason,
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
