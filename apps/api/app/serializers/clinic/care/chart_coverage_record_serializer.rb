module Clinic
  module Care
    module ChartCoverageRecordSerializer
      module_function

      def call(record)
        base = {
          id: record.id, type: record.class.name.demodulize.underscore, patient_id: record.patient_id,
          encounter_id: record.encounter_id, site_id: record.site_id, status: record.status,
          recorded_by_membership_id: record.recorded_by_membership_id,
          updated_by_membership_id: record.updated_by_membership_id, version: record.lock_version,
          created_at: iso(record.created_at), updated_at: iso(record.updated_at)
        }
        case record
        when MedicationRequest
          base.merge(priority: record.priority, medication_name: record.medication_name, dose_text: record.dose_text,
            route_text: record.route_text, frequency_text: record.frequency_text, reason_text: record.reason_text,
            requested_at: iso(record.requested_at), acknowledged_at: iso(record.acknowledged_at))
        when ServiceRequest
          base.merge(service_kind: record.service_kind, priority: record.priority, request_text: record.request_text,
            reason_text: record.reason_text, requested_at: iso(record.requested_at), acknowledged_at: iso(record.acknowledged_at))
        when Procedure
          base.merge(service_request_id: record.service_request_id, procedure_name: record.procedure_name,
            outcome_text: record.outcome_text, performed_at: iso(record.performed_at))
        when Immunization
          base.merge(service_request_id: record.service_request_id, vaccine_name: record.vaccine_name,
            lot_text: record.lot_text, site_text: record.site_text, outcome_text: record.outcome_text,
            administered_at: iso(record.administered_at))
        when EncounterDiagnosis
          base.merge(code_system: record.code_system, code: record.code, display_text: record.display_text,
            narrative: record.narrative, asserted_at: iso(record.asserted_at), supersedes_id: record.supersedes_id)
        when CarePlan
          base.merge(title: record.title, description: record.description, reviewed_at: iso(record.reviewed_at))
        when Goal
          base.merge(care_plan_id: record.care_plan_id, description: record.description, outcome_text: record.outcome_text,
            target_at: iso(record.target_at), completed_at: iso(record.completed_at))
        when DocumentReview
          base.merge(document_id: record.document_id, review_note: record.review_note, reviewed_at: iso(record.reviewed_at))
        end
      end

      def iso(value)
        value&.iso8601(6)
      end
      private_class_method :iso
    end
  end
end
