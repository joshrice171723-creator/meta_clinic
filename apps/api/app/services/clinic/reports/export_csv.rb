require "csv"
require "stringio"

module Clinic
  module Reports
    class ExportCsv
      class BoundedOutput < StringIO
        def write(value)
          if string.bytesize + value.bytesize > ExportSource::MAX_ARTIFACT_BYTES
            raise ExportSource::LimitExceeded, "The complete CSV exceeds the 2 MB technical limit. No artifact was issued."
          end
          super
        end

        def <<(value)
          write(value)
          self
        end
      end

      def self.call(report_id:, snapshot:, filters:, actor_id:, request_key:, issued_at:, source_digest:, serializer_revision:)
        report = snapshot
        definition = report.fetch("definition")
        rows = [["report", report_id], ["request_key", request_key], ["definition_revision", definition.fetch("revision")],
          ["serializer_revision", serializer_revision], ["source_digest_sha256", source_digest],
          ["issued_by_user_id", actor_id], ["issued_at", issued_at.iso8601(6)],
          ["practice_id", report.fetch("practice_id")], ["scope", filters["site_id"] ? "selected site" : "practice"],
          ["summary_scope", "All matching source records; every matching detail row is included"]]
        rows += [["export_scope", report.fetch("export_scope")], ["coverage_revision", report.fetch("coverage_revision")]]
        report.fetch("resource_limits").each { |key, value| rows << [key, value] }
        definition.each { |key, value| rows << [key, value] unless %w[id revision].include?(key) }
        filters.each { |key, value| rows << ["filter_#{key}", value] }
        %w[date inventory_date timezone interval_start interval_end as_of freshness database_snapshot consistency business_time].each do |key|
          rows << [key, report[key]] if report.key?(key)
        end
        case report_id
        when "daily_visits_by_state"
          rows << ["state", "count"]
          report.fetch("counts").each { |state, count| rows << [state, count] }
          rows += [["unknown_state", report.fetch("unknown_state_count")], ["total", report.fetch("total")]]
          section(rows, report, "records", %w[id site_id status visit_modality local_start])
        when "daily_invoices"
          rows << ["currency", "state", "count", "posted_line_total", "current_outstanding_balance"]
          report.fetch("currencies").each do |row|
            row.fetch("counts").each do |state, count|
              rows << [row["currency"], state, count, state == "posted" ? row["posted_line_total"] : "", ""]
            end
            rows << [row["currency"], "cohort_current_outstanding", "", "", row["current_outstanding_balance"]]
          end
          section(rows, report, "records", %w[id patient_id encounter_id source_site_id source_site_name currency status created_at current_outstanding_balance])
        when "daily_payment_activity"
          table(rows, report.fetch("currencies"), %w[currency payment_count payment_amount refund_count refund_amount])
          section(rows, report, "payment_records", %w[id patient_id source_sites currency amount created_at])
          section(rows, report, "refund_records", %w[id payment_event_id patient_id source_sites currency amount created_at])
        when "daily_stock_movements"
          table(rows, report.fetch("movements"), %w[stock_type stock_unit kind count signed_quantity])
          section(rows, report, "records", %w[id stock_type item_id batch_id location_id location_name source_site_id source_site_name kind stock_unit signed_quantity occurred_at])
        when "current_stock"
          rows += [["low_stock_scope", "All clinic products and office items, independent of pharmacy status filter"],
            ["low_pharmacy_products", report["low_product_count"]], ["low_office_items", report["low_office_count"]],
            ["stock_type", "unit", "physical_quantity", "available_quantity"]]
          report.fetch("pharmacy_units").each { |row| rows << ["pharmacy", row["unit"], row["physical"], row["available"]] }
          rows << ["office", "each", report["office_quantity"], ""]
          section(rows, report, "pharmacy_records", %w[id product_id name lot location unit physical available status expires_on expiring])
          section(rows, report, "office_records", %w[id name sku quantity reorder_level low_stock])
        end
        output = BoundedOutput.new("".dup)
        csv = CSV.new(output, row_sep: "\r\n", force_quotes: true)
        rows.each { |row| csv << row.map { |value| safe_cell(value) } }
        output.string
      end

      def self.section(rows, report, key, columns)
        rows << []
        rows << ["#{key}_scope", "All filtered rows"]
        coverage = report.fetch("row_counts").fetch(key)
        rows << ["#{key}_matched", coverage.fetch("matched")]
        rows << ["#{key}_complete", true]
        rows << ["#{key}_exported", report.fetch(key).length]
        table(rows, report.fetch(key), columns)
      end

      def self.table(rows, records, columns)
        rows << columns
        records.each { |record| rows << columns.map { |column| record[column] } }
      end

      def self.safe_cell(value)
        text = value.is_a?(Array) ? JSON.generate(value) : value.to_s
        # Preserve signed decimal quantities; neutralize spreadsheet formulas,
        # including leading control characters and whitespace.
        text.match?(/\A[[:space:]]*[=+@-]/) && !text.match?(/\A-?\d+(?:\.\d+)?\z/) ? "'#{text}" : text
      end
      private_class_method :section, :table, :safe_cell
    end
  end
end
