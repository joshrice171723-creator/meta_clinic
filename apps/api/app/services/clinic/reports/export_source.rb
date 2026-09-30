module Clinic
  module Reports
    # Only reports that already offered Operations CSV downloads are issuable.
    class ExportSource
      REPORTS = %w[daily_visits_by_state daily_invoices daily_payment_activity daily_stock_movements current_stock].freeze
      PAGES = {
        "daily_visits_by_state" => %w[page], "daily_invoices" => %w[page],
        "daily_payment_activity" => %w[payment_page refund_page],
        "daily_stock_movements" => %w[page], "current_stock" => %w[page office_page]
      }.freeze

      def self.normalize(report_id, input)
        raise ArgumentError, "This report does not support issuance." unless REPORTS.include?(report_id)

        input = input.to_h.stringify_keys
        allowed = PAGES.fetch(report_id) + (report_id == "current_stock" ? %w[status] : %w[date])
        allowed += %w[site_id] if report_id == "daily_visits_by_state"
        raise ArgumentError, "Unsupported export filters." unless (input.keys - allowed).empty?

        filters = PAGES.fetch(report_id).to_h do |key|
          value = input.fetch(key, 1).to_s
          raise ArgumentError, "Invalid export page." unless value.match?(/\A[1-9][0-9]{0,5}\z/)

          [key, value.to_i]
        end
        if report_id == "current_stock"
          status = input.fetch("status", "all").to_s
          raise ArgumentError, "Invalid stock status." unless %w[all available held expired].include?(status)

          filters["status"] = status
        else
          value = input["date"].to_s
          raise ArgumentError, "Select an ISO clinic date." unless value.match?(/\A\d{4}-\d{2}-\d{2}\z/)

          filters["date"] = Date.iso8601(value).iso8601
        end
        if report_id == "daily_visits_by_state" && input["site_id"].present?
          value = input["site_id"].to_s
          raise ArgumentError, "Invalid export site." unless value.match?(/\A[1-9][0-9]*\z/)

          filters["site_id"] = value.to_i
        end
        filters
      end

      def self.authorize!(practice:, actor:, report_id:, filters:)
        raise ArgumentError, "This report does not support issuance." unless REPORTS.include?(report_id)

        case report_id
        when "daily_visits_by_state"
          site = practice.sites.find(filters.fetch("site_id")) if filters["site_id"]
          Clinic::Authorization.authorize!(practice:, actor:, action: "appointments.read", site:)
        when "daily_invoices", "daily_payment_activity"
          Clinic::Authorization.authorize_with_legacy!(practice:, actor:, action: "billing.read", legacy_action: "billing.write")
        else
          Clinic::Authorization.authorize!(practice:, actor:, action: "inventory.read")
        end
      end

      def self.capture(practice:, actor:, report_id:, filters:)
        authorize!(practice:, actor:, report_id:, filters:)
        arguments = filters.symbolize_keys
        arguments[:date] = Date.iso8601(arguments[:date]) if arguments[:date]
        site = practice.sites.find(arguments.delete(:site_id)) if arguments[:site_id]
        query = case report_id
        when "daily_visits_by_state" then DailyVisitsByState
        when "daily_invoices" then DailyInvoices
        when "daily_payment_activity" then DailyPaymentActivity
        when "daily_stock_movements" then DailyStockMovements
        when "current_stock" then CurrentStock
        end
        arguments[:site] = site if report_id == "daily_visits_by_state"
        snapshot = query.call(practice:, actor:, **arguments).deep_stringify_keys
        snapshot
      end
    end
  end
end
