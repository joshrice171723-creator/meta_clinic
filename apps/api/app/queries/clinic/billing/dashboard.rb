module Clinic
  module Billing
    class Dashboard
      def self.call(practice:, now: Time.current, page: 1, per_page: 25, query: "", filter: "all", sort: "recent")
        local_now = now.in_time_zone(practice.timezone)
        period_start = local_now.beginning_of_month
        period_end = period_start.next_month
        invoices = practice.invoices
        currencies = invoices.distinct.order(:currency).pluck(:currency)

        page = Integer(page)
        per_page = Integer(per_page)
        raise ArgumentError, "Billing page must be positive." unless page.positive?
        raise ArgumentError, "Billing page size must be between 1 and 100." unless per_page.between?(1, 100)
        invoice_scope = invoice_scope(invoices, query: query, filter: filter)
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
            currencies: currencies.map { |currency| currency_metrics(invoices, currency, period_start, period_end) }
          },
          recent_invoices: invoice_scope.includes(:lines, :payment_allocations)
            .limit(per_page)
            .offset((page - 1) * per_page)
            .map { |invoice| invoice_summary(invoice) },
          invoice_pagination: { page: page, per_page: per_page, total: invoice_total, total_pages: invoice_pages },
          recent_payments: recent_payments(practice)
        }
      end

      def self.currency_metrics(invoices, currency, period_start, period_end)
        scoped = invoices.where(currency: currency).where.not(status: "void")
        posted = scoped.where(status: "posted")
        monthly = posted.where(created_at: period_start...period_end)
        monthly_invoiced = total_for(monthly)
        monthly_collected = allocated_for(posted, created_at: period_start...period_end)
        collected = allocated_for(posted)
        outstanding = total_for(posted) - collected

        {
          currency: currency,
          monthly_invoiced: decimal(monthly_invoiced),
          monthly_collected: decimal(monthly_collected),
          collected: decimal(collected),
          outstanding: decimal(outstanding),
          open_invoice_count: open_invoice_count(posted)
        }
      end
      private_class_method :currency_metrics

      def self.invoice_scope(invoices, query:, filter:)
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
          COALESCE((SELECT SUM(amount) FROM clinic_payment_allocations WHERE invoice_id = clinic_invoices.id), 0)
        SQL
        when "paid" then scope.where(status: "posted").where(<<~SQL.squish)
          COALESCE((SELECT SUM(posted_amount) FROM clinic_invoice_lines WHERE invoice_id = clinic_invoices.id), 0) <=
          COALESCE((SELECT SUM(amount) FROM clinic_payment_allocations WHERE invoice_id = clinic_invoices.id), 0)
        SQL
        else raise ArgumentError, "Invoice filter is not supported."
        end
      end
      private_class_method :invoice_scope

      def self.invoice_order(sort)
        case sort.to_s
        when "recent" then { created_at: :desc, id: :desc }
        when "oldest" then { created_at: :asc, id: :asc }
        when "balance_desc" then Arel.sql("(SELECT COALESCE(SUM(posted_amount), 0) FROM clinic_invoice_lines WHERE invoice_id = clinic_invoices.id) - (SELECT COALESCE(SUM(amount), 0) FROM clinic_payment_allocations WHERE invoice_id = clinic_invoices.id) DESC, clinic_invoices.id DESC")
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

      def self.open_invoice_count(invoices)
        invoices.where(<<~SQL.squish).count
          COALESCE((SELECT SUM(posted_amount) FROM clinic_invoice_lines WHERE invoice_id = clinic_invoices.id), 0) >
          COALESCE((SELECT SUM(amount) FROM clinic_payment_allocations WHERE invoice_id = clinic_invoices.id), 0)
        SQL
      end
      private_class_method :open_invoice_count

      def self.invoice_summary(invoice)
        total = invoice.lines.sum(&:posted_amount)
        allocated = invoice.payment_allocations.sum(&:amount)
        {
          id: invoice.id,
          status: invoice.status,
          currency: invoice.currency,
          total: decimal(total),
          allocated: decimal(allocated),
          balance: decimal(invoice.status == "void" ? 0 : total - allocated),
          created_at: invoice.created_at.iso8601
        }
      end
      private_class_method :invoice_summary

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

      def self.decimal(value)
        value.to_d.to_s("F")
      end
      private_class_method :decimal
    end
  end
end
