module Clinic
  module Scheduling
    class ProviderAssignmentsController < Clinic::ApiController
      def create
        input = parameter_hash!(:assignment, %i[patient_id clinician_profile_id request_key expected_token unassign])
        raise Clinic::Api::RequestParameters::Invalid.new("expected_token is required", field: :expected_token) unless input.key?(:expected_token)
        unassign = boolean_or_default(input[:unassign], field: :unassign)
        encounter = current_practice.encounters.where(patient_id: requested_id!(input[:patient_id], :patient_id)).find(requested_id!(params[:id], :id))
        profile = unassign ? nil : current_practice.clinician_profiles.find(requested_id!(input[:clinician_profile_id], :clinician_profile_id))
        result = AssignProvider.call(encounter: encounter, actor: current_user, clinician_profile: profile,
          request_key: input[:request_key], expected_token: input[:expected_token], unassign: unassign)
        render json: { assignment: { clinician_profile_id: result[:participant]&.membership&.clinician_profile&.id&.to_s, participant_id: result[:participant]&.id&.to_s, token: result[:token] } }
      end
    end
  end
end
