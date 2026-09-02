module Clinic
  module Care
    class PatientCareSummariesController < Clinic::ApiController
      before_action -> { require_capability("patients.read") }

      def show
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
        encounter = find_encounter(patient)
        render json: PatientCareSummarySerializer.call(patient, encounter: encounter)
      end

      private

      def find_encounter(patient)
        return unless params[:encounter_id].present?

        current_practice.encounters.where(patient: patient)
          .find(requested_id!(params[:encounter_id], :encounter_id))
      end
    end
  end
end
