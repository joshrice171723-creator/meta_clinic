module Clinic
  module Reports
    class DailyInvoices
      def self.call(practice:, actor:, date:, page: 1)
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.read", legacy_action: "billing.write")
        zone = ActiveSupport::TimeZone[practice.timezone] || raise(ArgumentError, "The clinic timezone is unavailable.")
        starts_at = zone.local(date.year, date.month, date.day)
        ends_at = zone.local(date.next_day.year, date.next_day.month, date.next_day.day)
        invoices = practice.invoices.where(created_at: starts_at...ends_at)
        records, pagination = SourcePage.call(scope: invoices, page:)
        counts = invoices.group(:currency, :status).count
        currencies = counts.keys.map(&:first).uniq.sort
        {
          definition: Catalog::DAILY_INVOICES, practice_id: practice.id, date: date.iso8601,
          timezone: zone.tzinfo.name, interval_start: starts_at.iso8601(6), interval_end: ends_at.iso8601(6),
          as_of: Time.current.iso8601(6), freshness: "live_source_query_no_cache",
          records: records.order(created_at: :desc, id: :desc)
            .pluck(:id, :patient_id, :currency, :status, :created_at,
              Arel.sql(Clinic::Billing::Dashboard::OUTSTANDING_BALANCE_SQL))
            .map { |id, patient_id, currency, status, created_at, balance|
              { id:, patient_id:, currency:, status:, created_at: created_at.iso8601(6),
                current_outstanding_balance: balance.to_d.to_s("F") }
            },
          records_capped: pagination[:total_pages] > 1,
          pagination:,
          currencies: currencies.map do |currency|
            scoped = invoices.where(currency:)
            posted = scoped.where(status: "posted")
            {
              currency:, counts: Clinic::Invoice::STATES.keys.index_with { |state| counts.fetch([ currency, state ], 0) },
              posted_line_total: Clinic::InvoiceLine.where(invoice_id: posted.select(:id)).sum(:posted_amount).to_d.to_s("F"),
              current_outstanding_balance: Clinic::Invoice.from(
                scoped.select(Arel.sql("#{Clinic::Billing::Dashboard::OUTSTANDING_BALANCE_SQL} AS outstanding_balance")), :cohort
              ).sum(:outstanding_balance).to_d.to_s("F")
            }
          end
        }
      end
    end
  end
end
