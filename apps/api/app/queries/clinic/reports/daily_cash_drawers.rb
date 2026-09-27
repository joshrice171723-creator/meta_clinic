module Clinic
  module Reports
    class DailyCashDrawers
      def self.call(practice:, actor:, date:, page: 1)
        ability = Ability.new(actor, practice:)
        action = %w[billing.payment_record billing.write billing.cash_reconcile].find { |code| ability.allowed_permission?(code) }
        Clinic::Authorization.authorize!(actor:, practice:, action: action || "billing.cash_reconcile")
        zone = ActiveSupport::TimeZone[practice.timezone] || raise(ArgumentError, "The clinic timezone is unavailable.")
        starts_at = zone.local(date.year, date.month, date.day)
        ends_at = zone.local(date.next_day.year, date.next_day.month, date.next_day.day)
        sessions = practice.cash_drawer_sessions.where(created_at: starts_at...ends_at)
        records, pagination = SourcePage.call(scope: sessions, page:)
        {
          definition: Catalog::DAILY_CASH_DRAWERS, date: date.iso8601, timezone: zone.tzinfo.name,
          as_of: Time.current.iso8601(6), pagination:,
          open_count: sessions.where(status: "open").count,
          awaiting_reconciliation_count: sessions.where(status: "closed", reconciliation_status: "pending").count,
          variance_count: sessions.where(status: "closed").where.not(discrepancy: 0).count,
          records: records.includes(:site).order(created_at: :desc, id: :desc).map do |session|
            currencies = Clinic::PaymentEvent.where(id: session.cash_tenders.select(:payment_event_id), practice:).distinct.order(:currency).pluck(:currency)
            row = Clinic::Billing::CashDrawer.call(session).slice(:id, :site_id, :status, :opening_float,
              :cash_received, :cash_refunded, :expected_cash, :counted_cash, :discrepancy, :opened_at,
              :closed_at, :reconciliation_status, :reconciled_at)
            row.merge(site_name: session.site.name, payment_currencies: currencies,
              expected_at_close: session.counted_cash && session.discrepancy && (session.counted_cash - session.discrepancy).to_s("F"))
          end
        }
      end
    end
  end
end
