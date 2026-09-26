module Clinic
  module Care
    module LabReportSerializer
      def self.report(report, detail: false)
        payload = {
          id: report.id,
          patient_id: report.patient_id,
          site_id: report.site_id,
          service_request_revision_id: report.service_request_revision_id,
          specimen: specimen(report.lab_specimen),
          source_name: report.source_name,
          external_report_id: report.external_report_id,
          current_version_id: report.current_version_id,
          current_version: report.current_version && version(report.current_version),
          open_prior_follow_ups: report.follow_ups.select { |item|
            item.state_open? && item.lab_report_version_id != report.current_version_id
          }.map { |item|
            { version_id: item.lab_report_version_id, version_number: item.lab_report_version.version_number }
          },
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
          result_priority: value.result_priority,
          collected_at: iso(value.collected_at),
          issued_at: iso(value.issued_at),
          results: value.results,
          entry_kind: value.entry_kind,
          content_digest: value.content_digest,
          recorded_at: iso(value.recorded_at),
          recorded_by: value.recorded_by_membership_id,
          reviewed_at: iso(value.reviewed_at),
          reviewed_by: value.reviewed_by_membership_id,
          actions: LabReportAction.where(practice_id: value.practice_id, lab_report_version_id: value.id).order(:id).map { |action|
            action.slice(:id, :kind, :note, :clinical_task_id, :recorded_by_membership_id).merge(recorded_at: iso(action.recorded_at))
          },
          follow_up: follow_up(value.follow_up)
        }
      end

      def self.follow_up(value)
        return unless value

        {
          id: value.id,
          state: value.state,
          instructions: value.instructions,
          outcome: value.outcome,
          recorded_at: iso(value.recorded_at),
          recorded_by: value.recorded_by_membership_id,
          completed_at: iso(value.completed_at),
          completed_by: value.completed_by_membership_id,
          superseded_at: iso(value.superseded_at)
        }.merge(
          priority: value.priority,
          due_at: iso(value.due_at),
          escalated_at: iso(value.escalated_at),
          escalated_by: value.escalated_by_membership_id,
          patient_contact_status: value.patient_contact_status,
          patient_contact_method: value.patient_contact_method,
          patient_contact_at: iso(value.patient_contact_at),
          contact_attempts: value.contact_attempts.includes(:clinical_task, :attempted_by_membership)
            .order(:attempted_at, :id).map { |attempt|
              {
                id: attempt.id, outcome: attempt.outcome, contact_method: attempt.contact_method,
                attempted_at: iso(attempt.attempted_at), recorded_at: iso(attempt.recorded_at),
                attempted_by: attempt.attempted_by_membership_id, note: attempt.note,
                next_action: {
                  task_id: attempt.clinical_task_id, state: attempt.clinical_task.state,
                  assigned_to_membership_id: attempt.clinical_task.assigned_to_membership_id,
                  due_at: iso(attempt.clinical_task.due_at)
                }
              }
            }
        )
      end

      def self.specimen(value)
        return unless value

        {
          id: value.id,
          service_request_revision_id: value.service_request_revision_id,
          specimen_identifier: value.specimen_identifier,
          specimen_type_code: value.specimen_type_code,
          specimen_type_display: value.specimen_type_display,
          condition_code: value.condition_code,
          collected_at: iso(value.collected_at),
          collected_by: value.collected_by_membership_id
        }
      end

      def self.follow_up_queue_item(value)
        version = value.lab_report_version
        {
          patient: {
            id: value.patient.id,
            display_name: value.patient.display_name,
            reference: value.patient.reference
          },
          report_id: value.lab_report_id,
          site_id: value.lab_report.site_id,
          current_version_id: value.lab_report.current_version_id,
          version: {
            id: version.id,
            version_number: version.version_number,
            title: version.title,
            issued_at: iso(version.issued_at),
            result_priority: version.result_priority
          },
          follow_up: follow_up(value)
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
          site_id: report.site_id,
          current_version: {
            id: version.id,
            title: version.title,
            status: version.status,
            result_priority: version.result_priority,
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
