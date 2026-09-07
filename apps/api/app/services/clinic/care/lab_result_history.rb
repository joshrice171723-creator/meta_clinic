module Clinic
  module Care
    class LabResultHistory
      MAX_REPORTS = 100

      def self.call(practice:, patient:, report:, version:, result_index:, page:, per_page:)
        selected_result = version.results.fetch(result_index) { raise ActiveRecord::RecordNotFound }
        selected = selected_payload(report, version, selected_result, result_index)
        relation = current_versions(practice:, patient:)
        total_reports = relation.count
        reports = relation.limit(MAX_REPORTS).to_a
        selected_report = practice.lab_reports.where(patient: patient).includes(:current_version).find(report.id)
        unless selected_report.current_version_id == version.id && !selected_report.current_version.status_cancelled?
          raise ActiveRecord::StaleObjectError.new(selected_report, "lab result history")
        end
        selected_position = reports.index { |candidate| candidate.id == selected_report.id }
        if selected_position
          reports[selected_position] = selected_report
        else
          reports << selected_report
        end

        items = reports.flat_map do |candidate|
          candidate_version = candidate.current_version
          candidate_version.results.each_with_index.filter_map do |result, index|
            next unless same_result?(selected, candidate.source_name, result)

            item_payload(candidate, candidate_version, result, index)
          end
        end

        total = items.length
        {
          selected: selected,
          items: items.slice((page - 1) * per_page, per_page) || [],
          pagination: { page: page, per_page: per_page, total: total },
          coverage: {
            reports_searched: reports.length,
            total_reports: total_reports,
            truncated: reports.length < total_reports
          }
        }
      end

      def self.current_versions(practice:, patient:)
        practice.lab_reports.where(patient: patient)
          .joins(:current_version)
          .where.not(clinic_lab_report_versions: { status: "cancelled" })
          .includes(:current_version)
          .order(
            Arel.sql("clinic_lab_report_versions.collected_at DESC"),
            Arel.sql("clinic_lab_reports.id DESC")
          )
      end
      private_class_method :current_versions

      def self.selected_payload(report, version, result, result_index)
        {
          report_id: report.id,
          version_id: version.id,
          result_index: result_index,
          name: result.fetch("name").to_s.strip,
          code: normalized_optional(result["code"]),
          unit: normalized_optional(result["unit"]),
          source_name: report.source_name.to_s.strip
        }
      end
      private_class_method :selected_payload

      def self.same_result?(selected, source_name, result)
        normalized_fold(source_name) == normalized_fold(selected.fetch(:source_name)) &&
          normalized_fold(result["name"]) == normalized_fold(selected.fetch(:name)) &&
          normalized_optional(result["code"]) == selected.fetch(:code) &&
          normalized_optional(result["unit"]) == selected.fetch(:unit)
      end
      private_class_method :same_result?

      def self.item_payload(report, version, result, result_index)
        {
          report_id: report.id,
          version_id: version.id,
          result_index: result_index,
          version_number: version.version_number,
          title: version.title,
          status: version.status,
          collected_at: version.collected_at.iso8601(6),
          issued_at: version.issued_at.iso8601(6),
          recorded_at: version.recorded_at.iso8601(6),
          value: result.fetch("value"),
          unit: normalized_optional(result["unit"]),
          reference_range: normalized_optional(result["reference_range"]),
          flag: normalized_optional(result["flag"]),
          reviewed_at: version.reviewed_at&.iso8601(6)
        }
      end
      private_class_method :item_payload

      def self.normalized_fold(value)
        value.to_s.strip.downcase
      end
      private_class_method :normalized_fold

      def self.normalized_optional(value)
        value.to_s.strip.presence
      end
      private_class_method :normalized_optional
    end
  end
end
