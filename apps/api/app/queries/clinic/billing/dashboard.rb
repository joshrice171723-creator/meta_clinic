module Clinic
  module Billing
    class Dashboard
      def self.call(practice:, now: Current.business_time, page: 1, per_page: 25, query: "", filter: "all", sort: "recent", outlook_months: 6, outlook_start: nil)
        local_now = now.in_time_zone(practice.timezone)
        period_start = local_now.beginning_of_month
        period_end = period_start.next_month
        invoices = practice.invoices
        currencies = (invoices.distinct.pluck(:currency) + Clinic::PaymentEvent.where(practice: practice).distinct.pluck(:currency)).uniq.sort

        page = Integer(page)
        per_page = Integer(per_page)
        raise ArgumentError, "Billing page must be positive." unless page.positive?
        raise ArgumentError, "Billing page size must be between 1 and 100." unless per_page.between?(1, 100)
        invoice_scope = invoice_scope(invoices, query: query, filter: filter, now: local_now)
        invoice_scope = invoice_scope.order(invoice_order(sort))
        invoice_total = invoice_scope.count
        invoice_pages = invoice_total.zero? ? 0 : (invoice_total.to_f / per_page).ceil

        {
          schema_version: "clinic-billing-v1",
          practice: { id: practice.id, name: practice.name, timezone: practice.timezone },
          period: { start: period_start.iso8601, end: period_end.iso8601 },
          metrics: {
            invoice_count: invoices.count,
            posted_count: invoices.where(status: "posted").count,
            draft_count: invoices.where(status: "draft").count,
            void_count: invoices.where(status: "void").count,
            currencies: currencies.map { |currency| currency_metrics(invoices, currency, period_start, period_end, practice) }
          },
          recent_invoices: invoice_scope.includes(:lines, :payment_allocations, :credit_notes)
            .limit(per_page)
            .offset((page - 1) * per_page)
            .map { |invoice| invoice_summary(invoice, now: local_now) },
          invoice_pagination: { page: page, per_page: per_page, total: invoice_total, total_pages: invoice_pages },
          recent_payments: recent_payments(practice),
          payment_activity: payment_activity(practice),
          payment_count: Clinic::PaymentEvent.where(practice: practice).count,
          card_collection: { available: false, reason: "Stripe card entry and saved payment methods are not connected to this workspace." },
          income_outlook: IncomeOutlook.call(practice: practice, now: now, months: outlook_months, start_month: outlook_start)
        }
      end

      def self.currency_metrics(invoices, currency, period_start, period_end, practice)
        scoped = invoices.where(currency: currency).where.not(status: "void")
        posted = scoped.where(status: "posted")
        monthly = posted.where(created_at: period_start...period_end)
        monthly_invoiced = total_for(monthly)
        monthly_collected = allocated_for(posted, created_at: period_start...period_end)
        collected = allocated_for(posted)
        outstanding = posted.sum(Arel.sql(outstanding_balance_sql))
        payments = Clinic::PaymentEvent.where(practice: practice, currency: currency, created_at: period_start...period_end)
        refunds = Clinic::RefundEvent.where(practice: practice, currency: currency, created_at: period_start...period_end).sum(:amount)

        {
          currency: currency,
          monthly_invoiced: decimal(monthly_invoiced),
          monthly_collected: decimal(monthly_collected),
          collected: decimal(collected),
          monthly_received: decimal(payments.sum(:amount)),
          monthly_refunded: decimal(refunds),
          monthly_net_collected: decimal(payments.sum(:amount) - refunds),
          outstanding: decimal(outstanding),
          open_invoice_count: open_invoice_count(posted)
        }
      end
      private_class_method :currency_metrics

      def self.invoice_scope(invoices, query:, filter:, now:)
        scope = invoices
        text = query.to_s.strip
        scope = scope.where(
          "CAST(clinic_invoices.id AS TEXT) ILIKE :query OR clinic_invoices.status ILIKE :query OR clinic_invoices.currency ILIKE :query",
          query: "%#{ActiveRecord::Base.sanitize_sql_like(text)}%"
        ) unless text.empty?

        case filter.to_s
        when "all" then scope
        when "draft" then scope.where(status: "draft")
        when "void" then scope.where(status: "void")
        when "open" then scope.where(status: "posted").where(<<~SQL.squish)
          COALESCE((SELECT SUM(posted_amount) FROM clinic_invoice_lines WHERE invoice_id = clinic_invoices.id), 0) >
          COALESCE((SELECT SUM(amount) FROM clinic_payment_allocations WHERE invoice_id = clinic_invoices.id), 0) +
          COALESCE((SELECT SUM(amount) FROM clinic_credit_notes WHERE invoice_id = clinic_invoices.id), 0)
        SQL
        when "paid" then scope.where(status: "posted").where(<<~SQL.squish)
          COALESCE((SELECT SUM(posted_amount) FROM clinic_invoice_lines WHERE invoice_id = clinic_invoices.id), 0) <=
          COALESCE((SELECT SUM(amount) FROM clinic_payment_allocations WHERE invoice_id = clinic_invoices.id), 0) +
          COALESCE((SELECT SUM(amount) FROM clinic_credit_notes WHERE invoice_id = clinic_invoices.id), 0)
        SQL
        when "age_0_30" then scope.where("created_at > ?", now - 31.days)
        when "age_31_60" then scope.where("created_at <= ? AND created_at > ?", now - 31.days, now - 61.days)
        when "age_61_90" then scope.where("created_at <= ? AND created_at > ?", now - 61.days, now - 91.days)
        when "age_91_plus" then scope.where("created_at <= ?", now - 91.days)
        else raise ArgumentError, "Invoice filter is not supported."
        end
      end
      private_class_method :invoice_scope

      def self.invoice_order(sort)
        case sort.to_s
        when "recent" then { created_at: :desc, id: :desc }
        when "oldest" then { created_at: :asc, id: :asc }
        when "balance_desc" then Arel.sql("#{outstanding_balance_sql} DESC, clinic_invoices.id DESC")
        when "total_desc" then Arel.sql("(SELECT COALESCE(SUM(posted_amount), 0) FROM clinic_invoice_lines WHERE invoice_id = clinic_invoices.id) DESC, clinic_invoices.id DESC")
        else raise ArgumentError, "Invoice sort is not supported."
        end
      end
      private_class_method :invoice_order

      def self.total_for(invoices)
        Clinic::InvoiceLine.where(invoice_id: invoices.select(:id)).sum(:posted_amount)
      end
      private_class_method :total_for

      def self.allocated_for(invoices, created_at: nil)
        allocations = Clinic::PaymentAllocation.where(invoice_id: invoices.select(:id))
        allocations = allocations.where(created_at:) if created_at
        allocations.sum(:amount)
      end
      private_class_method :allocated_for

      def self.outstanding_balance_sql
        <<~SQL.squish
          CASE WHEN clinic_invoices.status = 'void' THEN 0 ELSE GREATEST(0,
            COALESCE((SELECT SUM(posted_amount) FROM clinic_invoice_lines WHERE invoice_id = clinic_invoices.id), 0) -
            COALESCE((SELECT SUM(amount) FROM clinic_payment_allocations WHERE invoice_id = clinic_invoices.id), 0) -
            COALESCE((SELECT SUM(amount) FROM clinic_credit_notes WHERE invoice_id = clinic_invoices.id), 0)
          ) END
        SQL
      end
      private_class_method :outstanding_balance_sql

      def self.open_invoice_count(invoices)
        invoices.where(<<~SQL.squish).count
          COALESCE((SELECT SUM(posted_amount) FROM clinic_invoice_lines WHERE invoice_id = clinic_invoices.id), 0) >
          COALESCE((SELECT SUM(amount) FROM clinic_payment_allocations WHERE invoice_id = clinic_invoices.id), 0) +
          COALESCE((SELECT SUM(amount) FROM clinic_credit_notes WHERE invoice_id = clinic_invoices.id), 0)
        SQL
      end
      private_class_method :open_invoice_count

      def self.invoice_summary(invoice, now: Current.business_time)
        total = invoice.lines.sum(&:posted_amount)
        allocated = invoice.payment_allocations.sum(&:amount)
        credited = invoice.credit_notes.sum(&:amount)
        age_days = [ ((now - invoice.created_at) / 1.day).floor, 0 ].max
        {
          id: invoice.id,
          status: invoice.status,
          currency: invoice.currency,
          total: decimal(total),
          allocated: decimal(allocated),
          credited: decimal(credited),
          balance: decimal(invoice.status == "void" ? 0 : [ total - allocated - credited, 0 ].max),
          age_days: age_days,
          age_bucket: age_bucket(age_days),
          created_at: invoice.created_at.iso8601
        }
      end
      private_class_method :invoice_summary

      def self.age_bucket(age_days)
        case age_days
        when 0..30 then "0-30 days"
        when 31..60 then "31-60 days"
        when 61..90 then "61-90 days"
        else "91+ days"
        end
      end
      private_class_method :age_bucket

      def self.recent_payments(practice)
        Clinic::PaymentAllocation.where(practice: practice)
          .includes(:invoice)
          .order(created_at: :desc, id: :desc)
          .limit(6)
          .map do |allocation|
            {
              invoice_id: allocation.invoice_id,
              currency: allocation.invoice.currency,
              amount: decimal(allocation.amount),
              created_at: allocation.created_at.iso8601
            }
          end
      end
      private_class_method :recent_payments

      def self.payment_activity(practice)
        Clinic::PaymentEvent.where(practice: practice)
          .includes(:allocations, :refund_events, :billing_receipts, :cash_tender)
          .order(created_at: :desc, id: :desc).limit(20).map do |payment|
            refunded = payment.refund_events.sum(&:amount)
            {
              id: payment.id, patient_id: payment.patient_id, currency: payment.currency,
              amount: decimal(payment.amount), refunded: decimal(refunded),
              net_amount: decimal(payment.amount - refunded), created_at: payment.created_at.iso8601,
              method: payment.cash_tender ? "Cash" : "Recorded payment",
              allocations: payment.allocations.map { |a| { invoice_id: a.invoice_id, amount: decimal(a.amount) } },
              receipts: payment.billing_receipts.sort_by(&:id).map do |receipt|
                { id: receipt.id, kind: receipt.kind, amount: receipt.payload["amount"], issued_at: receipt.issued_at.iso8601 }
              end
            }
          end
      end
      private_class_method :payment_activity

      def self.decimal(value)
        value.to_d.to_s("F")
      end
      private_class_method :decimal
    end
  end
end
