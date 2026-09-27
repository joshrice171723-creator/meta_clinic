module Clinic
  module Reports
    class DailyPaymentActivity
      def self.call(practice:, actor:, date:)
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.read", legacy_action: "billing.write")
        zone = ActiveSupport::TimeZone[practice.timezone] || raise(ArgumentError, "The clinic timezone is unavailable.")
        starts_at = zone.local(date.year, date.month, date.day)
        ends_at = zone.local(date.next_day.year, date.next_day.month, date.next_day.day)
        payments = Clinic::PaymentEvent.where(practice:, created_at: starts_at...ends_at)
        refunds = Clinic::RefundEvent.where(practice:, created_at: starts_at...ends_at)
        payment_counts = payments.group(:currency).count
        payment_amounts = payments.group(:currency).sum(:amount)
        refund_counts = refunds.group(:currency).count
        refund_amounts = refunds.group(:currency).sum(:amount)
        currencies = (payment_counts.keys + refund_counts.keys).uniq.sort
        {
          definition: Catalog::DAILY_PAYMENT_ACTIVITY, practice_id: practice.id, date: date.iso8601,
          timezone: zone.tzinfo.name, interval_start: starts_at.iso8601(6), interval_end: ends_at.iso8601(6),
          as_of: Time.current.iso8601(6), freshness: "live_source_query_no_cache",
          currencies: currencies.map do |currency|
            {
              currency:, payment_count: payment_counts.fetch(currency, 0),
              payment_amount: payment_amounts.fetch(currency, 0).to_d.to_s("F"),
              refund_count: refund_counts.fetch(currency, 0),
              refund_amount: refund_amounts.fetch(currency, 0).to_d.to_s("F")
            }
          end
        }
      end
    end
  end
end
