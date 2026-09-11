module Clinic
  module PatientPortal
    module RefillRequestSerializer
      def self.call(request, include_patient: false, include_review_details: false)
        details = RefillRequestData.parse_content(request.content)
        outcome = request.status.in?(%w[resolved declined]) ? RefillRequestData.parse_outcome(request.review_note) : {}
        payload = {
          id: request.id,
          status: request.status,
          requested_at: request.requested_at.iso8601(6),
          reviewed_at: request.reviewed_at&.iso8601(6),
          medication_name: details["medication_name"],
          pharmacy_destination: details["pharmacy_destination"],
          request_note: details["request_note"],
          source: details["source"],
          decision: outcome["decision"],
          patient_message: outcome["patient_message"],
          source_encounter_id: request.source_encounter_id,
          medication_request_revision_id: request.medication_request_revision_id,
          response_delivery_state: request.refill_response_delivery&.state,
          response_delivery_failure_code: request.refill_response_delivery&.failure_code,
          reviewed_by: reviewed_by(request)
        }
        if include_review_details
          payload[:reconciliation_acknowledged] = outcome["reconciliation_acknowledged"] == true
          payload[:reconciliation_note] = outcome["reconciliation_note"]
        end
        return payload unless include_patient

        payload.merge(patient: {
          id: request.patient.id,
          display_name: request.patient.display_name,
          reference: request.patient.reference
        })
      end

      def self.reviewed_by(request)
        return unless request.reviewed_at

        version = Clinic::ModelVersion.for_practice(request.practice_id)
          .for_subject(request)
          .where(event: "update")
          .where("'status' = ANY(changed_fields)")
          .order(id: :desc)
          .first
        actor_id = Integer(version&.actor_reference, exception: false)
        return { display_name: "Clinic team" } unless actor_id

        membership = Clinic::Membership.includes(:clinician_profile)
          .find_by(practice_id: request.practice_id, user_id: actor_id)
        { display_name: membership&.clinician_profile&.display_name.presence || "Clinic team" }
      end
      private_class_method :reviewed_by
    end
  end
end
