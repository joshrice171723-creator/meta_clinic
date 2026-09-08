module Clinic
  module Telehealth
    module RemoveParticipant
      module_function

      def call(visit:, participant:, actor:, request_key:, expected_version:)
        AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :remove)
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor, operation_code: "telehealth.remove",
          request_key: request_key, resource: visit, authorization_action: "telehealth.host",
          authorization: -> {
            AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :remove)
          },
          payload: { visit_id: visit.id, participant_id: participant.id, expected_version: expected_version },
          result_resource: ->(command) { command },
          resource_resolver: ->(practice:, receipt:) { Command.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.with_lock do
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            participant.lock!
            participant.join_grants.where(revoked_at: nil).find_each do |grant|
              grant.update!(revoked_at: Time.current, revocation_reason: "participant_removed")
            end
            participant.update!(status: "removed", revoked_at: Time.current, revocation_reason: "removed_by_host")
            room = visit.current_room_attempt
            provider_eject_required = room && !room.status.in?(%w[ended failed])
            visit.commands.create!(practice_id: visit.practice_id, room_attempt_id: room&.id, participant_id: participant.id,
              kind: "eject_participant", dedupe_key: "eject:#{visit.access_generation}:#{participant.id}",
              access_generation: visit.access_generation, status: provider_eject_required ? "pending" : "succeeded",
              available_at: Time.current, completed_at: (Time.current unless provider_eject_required))
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
