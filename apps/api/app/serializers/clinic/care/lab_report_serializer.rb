module Clinic
  module Care
    module LabReportSerializer
      def self.report(report, detail: false)
        payload = {
          id: report.id,
          patient_id: report.patient_id,
          source_name: report.source_name,
          external_report_id: report.external_report_id,
          current_version_id: report.current_version_id,
          current_version: report.current_version && version(report.current_version),
          created_at: iso(report.created_at),
          updated_at: iso(report.updated_at)
        }
        payload[:versions] = report.report_versions.map { |item| version(item) } if detail
        payload
      end

      def self.version(value)
        {
          id: value.id,
          lab_report_id: value.lab_report_id,
          patient_id: value.patient_id,
          version_number: value.version_number,
          title: value.title,
          status: value.status,
          collected_at: iso(value.collected_at),
          issued_at: iso(value.issued_at),
          results: value.results,
          entry_kind: value.entry_kind,
          content_digest: value.content_digest,
          recorded_at: iso(value.recorded_at),
          recorded_by: value.recorded_by_membership_id,
          reviewed_at: iso(value.reviewed_at),
          reviewed_by: value.reviewed_by_membership_id
        }
      end

      def self.review_queue_item(report)
        version = report.current_version
        {
          patient: {
            id: report.patient.id,
            display_name: report.patient.display_name,
            reference: report.patient.reference
          },
          report_id: report.id,
          current_version: {
            id: version.id,
            title: version.title,
            status: version.status,
            issued_at: iso(version.issued_at),
            result_count: version.results.size
          }
        }
      end

      def self.iso(value)
        value&.iso8601(6)
      end
      private_class_method :iso
    end
  end
end
