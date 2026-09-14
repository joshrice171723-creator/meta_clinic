module Clinic
  module Care
    module LabReportActions
      module_function

      def request_recollection!(practice:, report:, version:, member:, request_key:, note:)
        existing = LabReportAction.find_by(practice:, lab_report_version: version, kind: "recollection_requested")
        return existing if existing
        action_id = ApplicationRecord.connection.select_value("SELECT nextval(pg_get_serial_sequence('clinic_lab_report_actions', 'id'))")
        task = Clinic::ClinicalTask.create!(practice:, patient: report.patient, encounter_id: report.service_request_revision.encounter_id,
          site: report.site, task_kind: "result_follow_up", state: "open", pool_code: "clinical", source_type: "lab_follow_up", source_id: action_id,
          recorded_by_membership: member)
        LabReportAction.create!(id: action_id, practice:, patient_id: report.patient_id, lab_report_version: version,
          recorded_by_membership: member, clinical_task: task, kind: "recollection_requested", request_key:, note:, recorded_at: Current.business_time)
      end

      def record(practice:, actor:, report:, version:, kind:, note:, request_key:, replacement_report_id: nil)
        authorize = -> { Clinic::Authorization.authorize!(actor:, practice:, action: "patients.read", subject: report.patient); Clinic::Authorization.authorize!(actor:, practice:, action: "notes.write", site: report.site) }
        authorize.call
        raise ActiveRecord::RecordNotFound unless report.practice_id == practice.id && version.lab_report_id == report.id
        result = Clinic::Idempotency.execute(practice:, actor:, operation_code: "lab_report.action", request_key:,
          payload: { report_id: report.id, version_id: version.id, kind:, note:, replacement_report_id: }, authorization_action: "notes.write", authorization: authorize,
          result_resource: ->(action) { action }, resource_resolver: ->(practice:, receipt:) { LabReportAction.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          report.lock!
          unless report.current_version_id == version.id || kind == "recollection_completed"
            raise ActiveRecord::StaleObjectError.new(report, "lab action")
          end
          existing = LabReportAction.find_by(practice:, lab_report_version: version, kind:)
          next existing if existing
          member = practice.memberships.active.find_by!(user: actor)
          task = nil
          action_id = ApplicationRecord.connection.select_value("SELECT nextval(pg_get_serial_sequence('clinic_lab_report_actions', 'id'))")
          if kind == "recollection_requested"
            raise ArgumentError, "Record the recollection instructions." if note.to_s.strip.empty?
            raise ArgumentError, "Recollection requires a rejected or compromised specimen." unless report.lab_specimen&.condition_code.in?(%w[rejected compromised])
            next request_recollection!(practice:, report:, version:, member:, request_key:, note:)
          elsif kind == "recollection_completed"
            raise ArgumentError, "Record the recollection outcome." if note.to_s.strip.empty?
            original = LabReportAction.where(practice:, lab_report_version: version, kind: "recollection_requested").first!
            replacement = practice.lab_reports.where(patient_id: report.patient_id).find(replacement_report_id)
            unless replacement.id != report.id && replacement.lab_specimen&.condition_code == "satisfactory" &&
                replacement.lab_specimen.collected_at > report.lab_specimen.collected_at &&
                replacement.service_request_revision.series_id == report.service_request_revision.series_id
              raise ArgumentError, "Link a later satisfactory specimen report for this lab order."
            end
            task = original.clinical_task
            task.lock!
            Clinic::Care::TaskContinuity.ensure_unblocked!(task)
            task.update!(state: "completed", resolution_code: "completed", completed_by_membership: member, completed_at: Current.business_time)
          end
          LabReportAction.create!(id: action_id, practice:, patient_id: report.patient_id, lab_report_version: version, replacement_report_id:,
            recorded_by_membership: member, clinical_task: task, kind:, request_key:, note:, recorded_at: Current.business_time)
        end
        result.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
