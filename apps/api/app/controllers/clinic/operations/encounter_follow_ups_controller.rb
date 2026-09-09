module Clinic
  module Operations
    class EncounterFollowUpsController < Clinic::ApiController
      def show
        encounter = encounter_scope.find(requested_id!(params[:encounter_id], :encounter_id))
        render json: Clinic::Operations::EncounterFollowUps.show(
          practice: current_practice, actor: current_user, encounter: encounter
        )
      end

      def upsert
        encounter = encounter_scope.find(requested_id!(params[:encounter_id], :encounter_id))
        input = parameter_hash!(:follow_up,
          %i[request_key expected_version status plan follow_up_appointment_id due_at assigned_to_membership_id])
        follow_up = Clinic::Operations::EncounterFollowUps.record(
          practice: current_practice, actor: current_user, encounter: encounter,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647),
          attributes: input.except(:request_key, :expected_version)
        )
        render json: { follow_up: Clinic::Operations::EncounterFollowUps.serialize(follow_up) }
      end

      def update
        follow_up = Clinic::EncounterFollowUp.where(practice_id: current_practice.id)
          .find(requested_id!(params[:id], :id))
        input = parameter_hash!(:follow_up, %i[action request_key expected_version outcome])
        updated = Clinic::Operations::EncounterFollowUps.transition(
          practice: current_practice, actor: current_user, follow_up: follow_up,
          action: required_string!(input[:action], field: :action, maximum: 20),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          expected_version: bounded_integer!(input[:expected_version], field: :expected_version, min: 0, max: 2_147_483_647),
          outcome: input[:outcome]
        )
        render json: { follow_up: Clinic::Operations::EncounterFollowUps.serialize(updated) }
      end

      private

      def encounter_scope
        current_practice.encounters
      end
    end
  end
end
