module Clinic
  module Telehealth
    module RequestReconciliation
      module_function

      def call(visit:, actor:, request_key:, expected_version:)
        AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :reconcile)
        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor, operation_code: "telehealth.reconcile",
          request_key: request_key, resource: visit, authorization_action: "telehealth.reconcile",
          authorization: -> {
            AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :reconcile)
          },
          payload: { visit_id: visit.id, expected_version: expected_version }, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { Command.find_by(practice_id: practice.id, id: receipt.resource_id) }) do
          visit.with_lock do
            raise ActiveRecord::StaleObjectError.new(visit, "update") unless visit.lock_version == expected_version.to_i
            room = visit.current_room_attempt
            raise Error.new("There is no provider room to reconcile.", code: "room_not_found", status: :conflict) unless room
            visit.commands.create!(practice_id: visit.practice_id, room_attempt_id: room.id, kind: "reconcile_room",
              dedupe_key: "reconcile:#{visit.access_generation}:#{room.id}:#{request_key}",
              access_generation: visit.access_generation, status: "pending", available_at: Time.current)
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
