module Clinic
  module Care
    class VisitInstructionsController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }

      def show
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
        encounter = current_practice.encounters.where(patient: patient)
          .find(requested_id!(params[:encounter_id], :encounter_id))
        Clinic::Authorization.authorize!(
          actor: current_user, practice: current_practice, action: "notes.read", site: encounter.site
        )
        item = ReleasedVisitInstructions.handout(practice: current_practice, patient: patient, encounter: encounter)
        Clinic::AuditRecorder.record!(
          practice: current_practice, actor: current_user,
          action_code: "visit_instructions.read", outcome: :released,
          resource_version_ref: "Clinic::Encounter/#{encounter.id}"
        )
        render json: { item: item }
      end
    end
  end
end
