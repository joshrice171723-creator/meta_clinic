module Clinic
  module Scheduling
    class IntakeOwnershipController < Clinic::ApiController
      before_action -> { require_capability("intake.write", any_site: true) }

      def claim
        change(:claim)
      end

      def release
        change(:release)
      end

      private

      def change(action)
        input = parameter_hash!(:ownership, %i[request_key expected_token])
        unless input.key?(:expected_token)
          raise Clinic::Api::RequestParameters::Invalid.new(
            "expected_token is required",
            field: :expected_token
          )
        end
        encounter = current_practice.encounters
          .where(patient: current_practice.patients.accessible_by(current_ability, :read))
          .find(requested_id!(params[:encounter_id], :encounter_id))
        participant = IntakeOwnership.public_send(
          action,
          encounter: encounter,
          actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          expected_token: input[:expected_token]&.to_s
        )
        render json: {
          intake_ownership: {
            participant_id: participant.id.to_s,
            token: action == :release ? nil : participant.id.to_s,
            lease_expires_at: participant.effective_until&.iso8601(6)
          }
        }
      end
    end
  end
end
