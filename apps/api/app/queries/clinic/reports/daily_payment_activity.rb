module Clinic
  module Reports
    class DailyPaymentActivity
      def self.call(practice:, actor:, date:, payment_page: 1, refund_page: 1, export_limit: nil, export_deadline: nil)
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:, action: "billing.read", legacy_action: "billing.write")
        zone = ActiveSupport::TimeZone[practice.timezone] || raise(ArgumentError, "The clinic timezone is unavailable.")
        starts_at = zone.local(date.year, date.month, date.day)
        ends_at = zone.local(date.next_day.year, date.next_day.month, date.next_day.day)
        payments = Clinic::PaymentEvent.where(practice:, created_at: starts_at...ends_at)
        refunds = Clinic::RefundEvent.where(practice:, created_at: starts_at...ends_at)
        unless export_limit.nil?
          SourcePage.check_export_deadline!(deadline: export_deadline)
          SourcePage.check_export_limit!(total: payments.count + refunds.count, export_limit:)
          SourcePage.check_export_deadline!(deadline: export_deadline)
        end
        payment_records, payment_pagination = SourcePage.call(scope: payments, page: payment_page, export_limit:, export_deadline:)
        refund_records, refund_pagination = SourcePage.call(scope: refunds, page: refund_page, export_limit:, export_deadline:)
        payment_counts = payments.group(:currency).count
        payment_amounts = payments.group(:currency).sum(:amount)
        refund_counts = refunds.group(:currency).count
        refund_amounts = refunds.group(:currency).sum(:amount)
        currencies = (payment_counts.keys + refund_counts.keys).uniq.sort
        {
          definition: Catalog::DAILY_PAYMENT_ACTIVITY, practice_id: practice.id, date: date.iso8601,
          timezone: zone.tzinfo.name, interval_start: starts_at.iso8601(6), interval_end: ends_at.iso8601(6),
          as_of: Time.current.iso8601(6), freshness: "live_source_query_no_cache",
          payment_records: payment_records.order(created_at: :desc, id: :desc)
            .includes(allocations: { invoice: { encounter: :site } }).map { |payment|
              SourcePage.check_export_deadline!(deadline: export_deadline)
              { id: payment.id, patient_id: payment.patient_id, currency: payment.currency,
                amount: payment.amount.to_d.to_s("F"), created_at: payment.created_at.iso8601(6),
                source_sites: Clinic::Billing::InvoiceSerializer.payment_source_sites(payment) }
            },
          payment_records_capped: payment_pagination[:total_pages] > 1,
          payment_pagination:,
          refund_records: refund_records.order(created_at: :desc, id: :desc)
            .includes(payment_event: { allocations: { invoice: { encounter: :site } } }).map { |refund|
              SourcePage.check_export_deadline!(deadline: export_deadline)
              { id: refund.id, patient_id: refund.patient_id, payment_event_id: refund.payment_event_id,
                currency: refund.currency, amount: refund.amount.to_d.to_s("F"), created_at: refund.created_at.iso8601(6),
                source_sites: Clinic::Billing::InvoiceSerializer.payment_source_sites(refund.payment_event) }
            },
          refund_records_capped: refund_pagination[:total_pages] > 1,
          refund_pagination:,
          currencies: currencies.map do |currency|
            SourcePage.check_export_deadline!(deadline: export_deadline)
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
