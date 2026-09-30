module Clinic
  module Reports
    # Only reports that already offered Operations CSV downloads are issuable.
    class ExportSource
      class LimitExceeded < StandardError; end
      class CaptureMismatch < StandardError; end

      COMPLETE_SCOPE = "all_filtered_rows"
      MAX_ROWS = 10_000
      MAX_ARTIFACT_BYTES = 2_000_000
      MAX_SNAPSHOT_BYTES = 4_000_000
      MAX_QUERY_MS = 5_000
      MAX_CAPTURE_MS = 15_000
      MAX_LOCK_WAIT_MS = 5_000
      SECTIONS = {
        "daily_visits_by_state" => { "records" => "pagination" },
        "daily_invoices" => { "records" => "pagination" },
        "daily_payment_activity" => { "payment_records" => "payment_pagination", "refund_records" => "refund_pagination" },
        "daily_stock_movements" => { "records" => "pagination" },
        "current_stock" => { "pharmacy_records" => "pagination", "office_records" => "office_pagination" }
      }.freeze
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

      def self.normalize_complete(report_id, input)
        input = input.to_h.stringify_keys
        raise ArgumentError, "This report does not support issuance." unless REPORTS.include?(report_id)
        unless (input.keys & PAGES.fetch(report_id)).empty?
          raise ArgumentError, "Page numbers do not filter complete exports."
        end

        normalize(report_id, input).except(*PAGES.fetch(report_id))
      end

      def self.resource_limits
        { "max_rows" => MAX_ROWS, "max_artifact_bytes" => MAX_ARTIFACT_BYTES,
          "max_snapshot_bytes" => MAX_SNAPSHOT_BYTES, "max_query_ms" => MAX_QUERY_MS,
          "max_lock_wait_ms" => MAX_LOCK_WAIT_MS, "max_capture_ms" => MAX_CAPTURE_MS }
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
        deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + MAX_CAPTURE_MS / 1000.0
        arguments[:export_limit] = MAX_ROWS
        arguments[:export_deadline] = deadline
        snapshot = query.call(practice:, actor:, **arguments).deep_stringify_keys
        SourcePage.check_export_deadline!(deadline:)
        row_counts = SECTIONS.fetch(report_id).to_h do |records_key, pagination_key|
          records = snapshot.fetch(records_key)
          matched = snapshot.fetch(pagination_key).fetch("total")
          ids = records.map { |record| record.fetch("id") }
          unless records.length == matched && ids.uniq.length == matched
            raise CaptureMismatch, "The complete export could not be reconciled to its source row count. No artifact was issued."
          end

          [records_key, { "matched" => matched, "exported" => records.length }]
        end
        if row_counts.values.sum { |counts| counts.fetch("matched") } > MAX_ROWS
          raise LimitExceeded, "The complete filtered report exceeds the combined export row limit."
        end
        snapshot.merge("export_scope" => COMPLETE_SCOPE, "coverage_revision" => 2,
          "row_counts" => row_counts, "resource_limits" => resource_limits)
      end
    end
  end
end
