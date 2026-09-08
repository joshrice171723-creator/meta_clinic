module Clinic
  module Telehealth
    module EndVisit
      module_function

      def call(visit:, actor:, request_key:, expected_version:, reason_code: "host_ended")
        membership = AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :end)
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor, operation_code: "telehealth.end",
          request_key: request_key, resource: visit, authorization_action: "telehealth.host",
          authorization: -> {
            AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :end)
          },
          payload: { visit_id: visit.id, expected_version: expected_version, reason_code: reason_code },
          result_resource: ->(command) { command },
          resource_resolver: ->(practice:, receipt:) { Command.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.with_lock do
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            raise Error.new("This video visit has already ended.", code: "visit_ended", status: :conflict) if visit.ended?
            room = visit.current_room_attempt
            provider_end_required = room && !room.status.in?(%w[ended failed])
            visit.join_grants.where(revoked_at: nil).find_each do |grant|
              grant.update!(revoked_at: Time.current, revocation_reason: "visit_ending")
            end
            visit.update!(status: provider_end_required ? "ending" : "ended", ended_by_membership_id: membership.id,
              end_reason_code: reason_code, last_ended_at: (Time.current unless provider_end_required),
              scribe_capture_owner_participant_id: nil, scribe_capture_owner_token_digest: nil,
              scribe_capture_lease_expires_at: nil, scribe_capture_epoch: visit.scribe_capture_epoch + 1)
            room&.update!(status: "ending") if provider_end_required && !room.status.in?(%w[ending unknown])
            visit.commands.create!(practice_id: visit.practice_id, room_attempt_id: room&.id, kind: "end_room",
              dedupe_key: "end:#{visit.access_generation}:#{room&.id || 'none'}", access_generation: visit.access_generation,
              status: provider_end_required ? "pending" : "succeeded", available_at: Time.current,
              completed_at: (Time.current unless provider_end_required))
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
