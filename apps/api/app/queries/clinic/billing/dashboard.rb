module Clinic
  module Billing
    class Dashboard
      def self.call(practice:, now: Time.current)
        period_start = now.beginning_of_month
        period_end = period_start.next_month
        invoices = practice.invoices
        currencies = invoices.distinct.order(:currency).pluck(:currency)

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
          recent_invoices: invoices.includes(:lines, :payment_allocations).recent.limit(8).map { |invoice| invoice_summary(invoice) },
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
