module Clinic
  module Billing
    # Read-only planning projection. Revenue and collection estimates are separate
    # measures: adding them would count the same future business twice.
    class IncomeOutlook
      def self.call(practice:, now:, months: 6, start_month: nil)
        current = now.in_time_zone(practice.timezone).beginning_of_month
        first = start_month ? Time.find_zone!(practice.timezone).local(start_month.year, start_month.month, 1) : current.next_month
        history_start = current - 3.months
        invoices = practice.invoices.where(status: "posted")
        payments = Clinic::PaymentEvent.where(practice: practice)
        refunds = Clinic::RefundEvent.where(practice: practice)
        currencies = (invoices.distinct.pluck(:currency) + payments.distinct.pluck(:currency)).uniq.sort

        {
          history_start: history_start.to_date.iso8601,
          history_end: current.to_date.iso8601,
          start_month: first.to_date.iso8601,
          months: months,
          currencies: currencies.map do |currency|
            scoped = invoices.where(currency: currency)
            history = 3.times.map do |offset|
              month = history_start + offset.months
              range = month...month.next_month
              issued = scoped.where(created_at: range)
              charges = Clinic::InvoiceLine.where(invoice_id: issued.select(:id)).sum(:posted_amount)
              credits = Clinic::CreditNote.where(practice: practice, invoice_id: issued.select(:id)).sum(:amount)
              received = payments.where(currency: currency, created_at: range).sum(:amount)
              refunded = refunds.where(currency: currency, created_at: range).sum(:amount)
              {
                month: month.to_date.iso8601, invoice_count: issued.count,
                net_charges: decimal([charges - credits, 0].max),
                received: decimal(received), refunded: decimal(refunded),
                net_collected: decimal(received - refunded)
              }
            end
            has_history = history.any? { |row| row[:invoice_count].positive? }
            average = has_history ? (history.sum { |row| row[:net_charges].to_d } / 3).round(2) : nil
            outstanding = Clinic::InvoiceLine.where(invoice_id: scoped.select(:id)).sum(:posted_amount) -
              Clinic::PaymentAllocation.where(practice: practice, invoice_id: scoped.select(:id)).sum(:amount) -
              Clinic::CreditNote.where(practice: practice, invoice_id: scoped.select(:id)).sum(:amount)
            outstanding = [outstanding, 0].max.to_d
            installment = (outstanding / months).floor(2)
            {
              currency: currency, history: history,
              outstanding: decimal(outstanding),
              history_invoice_count: history.sum { |row| row[:invoice_count] },
              estimated_monthly_revenue: average && decimal(average),
              forecast: months.times.map do |offset|
                { month: (first + offset.months).to_date.iso8601,
                  expected_existing_collections: decimal(offset == months - 1 ? outstanding - installment * (months - 1) : installment),
                  estimated_new_revenue: average && decimal(average) }
              end
            }
          end
        }
      end

      def self.decimal(value)
        value.to_d.to_s("F")
      end
      private_class_method :decimal
    end
  end
end
