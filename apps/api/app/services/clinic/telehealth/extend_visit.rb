module Clinic
  module Telehealth
    module ExtendVisit
      module_function

      def call(visit:, actor:, request_key:, expected_version:, requested_expires_at:)
        AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :extend)
        requested = requested_expires_at&.in_time_zone
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor, operation_code: "telehealth.extend",
          request_key: request_key, resource: visit, authorization_action: "telehealth.host",
          authorization: -> {
            AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :extend)
          },
          payload: { visit_id: visit.id, expected_version: expected_version,
            requested_expires_at: requested&.iso8601(6) },
          result_resource: ->(command) { command },
          resource_resolver: ->(practice:, receipt:) { Command.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.with_lock do
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            room = visit.current_room_attempt
            raise Error.new("There is no active room to extend.", code: "room_not_active", status: :conflict) unless room&.status.in?(%w[ready active])
            raise Error.new("The room has not started yet.", code: "room_not_started", status: :conflict) unless visit.first_started_at
            ceiling = visit.first_started_at.to_time + visit.policy_version.max_room_minutes.minutes
            requested ||= [ room.expires_at + 15.minutes, ceiling ].min
            unless requested > room.expires_at && requested <= ceiling
              raise Error.new("The requested extension exceeds the visit policy.", code: "extension_out_of_bounds")
            end
            visit.commands.create!(practice_id: visit.practice_id, room_attempt_id: room.id, kind: "extend_room",
              requested_expires_at: requested, dedupe_key: "extend:#{visit.access_generation}:#{room.id}:#{requested.to_i}",
              access_generation: visit.access_generation, status: "pending", available_at: Time.current)
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
