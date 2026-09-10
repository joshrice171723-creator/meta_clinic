module Clinic
  module Care
    class PatientEducationEventsController < Clinic::ApiController
      def index
        patient, encounter = patient_and_encounter
        render json: PatientEducation.index(practice: current_practice, actor: current_user, patient:, encounter:)
      end

      def create
        patient, encounter = patient_and_encounter
        input = parameter_hash!(:education_event, %i[
          request_key topic_code topic_title delivery_method recipient material_title material_url language
          interpreter_used teach_back_status patient_response reteaching_summary follow_up_needed follow_up_plan
        ])
        event = PatientEducation.record(
          practice: current_practice, actor: current_user, patient:, encounter:,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          attributes: input.except(:request_key).merge(
            interpreter_used: boolean_or_default(input[:interpreter_used], field: :interpreter_used),
            follow_up_needed: boolean_or_default(input[:follow_up_needed], field: :follow_up_needed)
          )
        )
        render json: { education_event: event }, status: :created
      end

      private

      def patient_and_encounter
        patient = current_practice.patients.accessible_by(current_ability, :read)
          .find(requested_id!(params[:patient_id], :patient_id))
        encounter = current_practice.encounters.where(patient:)
          .find(requested_id!(params[:encounter_id], :encounter_id))
        [ patient, encounter ]
      end
    end
  end
end
