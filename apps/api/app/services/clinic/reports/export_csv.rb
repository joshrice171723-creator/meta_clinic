require "csv"

module Clinic
  module Reports
    class ExportCsv
      def self.call(report_id:, snapshot:, filters:, actor_id:, request_key:, issued_at:, source_digest:, serializer_revision:)
        report = snapshot
        definition = report.fetch("definition")
        rows = [["report", report_id], ["request_key", request_key], ["definition_revision", definition.fetch("revision")],
          ["serializer_revision", serializer_revision], ["source_digest_sha256", source_digest],
          ["issued_by_user_id", actor_id], ["issued_at", issued_at.iso8601(6)],
          ["practice_id", report.fetch("practice_id")], ["scope", filters["site_id"] ? "selected site" : "practice"],
          ["summary_scope", "All matching source records; detail rows are selected pages only"]]
        definition.each { |key, value| rows << [key, value] unless %w[id revision].include?(key) }
        filters.each { |key, value| rows << ["filter_#{key}", value] }
        %w[date inventory_date timezone interval_start interval_end as_of freshness database_snapshot consistency].each do |key|
          rows << [key, report[key]] if report.key?(key)
        end
        case report_id
        when "daily_visits_by_state"
          rows << ["state", "count"]
          report.fetch("counts").each { |state, count| rows << [state, count] }
          rows += [["unknown_state", report.fetch("unknown_state_count")], ["total", report.fetch("total")]]
          section(rows, report, "records", %w[id site_id status visit_modality local_start], "pagination")
        when "daily_invoices"
          rows << ["currency", "state", "count", "posted_line_total", "current_outstanding_balance"]
          report.fetch("currencies").each do |row|
            row.fetch("counts").each do |state, count|
              rows << [row["currency"], state, count, state == "posted" ? row["posted_line_total"] : "", ""]
            end
            rows << [row["currency"], "cohort_current_outstanding", "", "", row["current_outstanding_balance"]]
          end
          section(rows, report, "records", %w[id patient_id currency status created_at current_outstanding_balance], "pagination")
        when "daily_payment_activity"
          table(rows, report.fetch("currencies"), %w[currency payment_count payment_amount refund_count refund_amount])
          section(rows, report, "payment_records", %w[id patient_id currency amount created_at], "payment_pagination")
          section(rows, report, "refund_records", %w[id payment_event_id patient_id currency amount created_at], "refund_pagination")
        when "daily_stock_movements"
          table(rows, report.fetch("movements"), %w[stock_type stock_unit kind count signed_quantity])
          section(rows, report, "records", %w[id stock_type item_id batch_id kind stock_unit signed_quantity occurred_at], "pagination")
        when "current_stock"
          rows += [["low_stock_scope", "All clinic products and office items, independent of pharmacy status filter"],
            ["low_pharmacy_products", report["low_product_count"]], ["low_office_items", report["low_office_count"]],
            ["stock_type", "unit", "physical_quantity", "available_quantity"]]
          report.fetch("pharmacy_units").each { |row| rows << ["pharmacy", row["unit"], row["physical"], row["available"]] }
          rows << ["office", "each", report["office_quantity"], ""]
          section(rows, report, "pharmacy_records", %w[id product_id name lot location unit physical available status expires_on expiring], "pagination")
          section(rows, report, "office_records", %w[id name sku quantity reorder_level low_stock], "office_pagination")
        end
        CSV.generate(row_sep: "\r\n", force_quotes: true) do |csv|
          rows.each { |row| csv << row.map { |value| safe_cell(value) } }
        end
      end

      def self.section(rows, report, key, columns, pagination_key)
        rows << []
        rows << ["#{key}_scope", "Selected page only"]
        report.fetch(pagination_key).each { |name, value| rows << ["#{key}_#{name}", value] }
        rows << ["#{key}_exported", report.fetch(key).length]
        table(rows, report.fetch(key), columns)
      end

      def self.table(rows, records, columns)
        rows << columns
        records.each { |record| rows << columns.map { |column| record[column] } }
      end

      def self.safe_cell(value)
        text = value.to_s
        # Preserve signed decimal quantities; neutralize spreadsheet formulas,
        # including leading control characters and whitespace.
        text.match?(/\A[[:space:]]*[=+@-]/) && !text.match?(/\A-?\d+(?:\.\d+)?\z/) ? "'#{text}" : text
      end
      private_class_method :section, :table, :safe_cell
    end
  end
end
