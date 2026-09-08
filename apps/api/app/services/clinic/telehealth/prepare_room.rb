module Clinic
  module Telehealth
    module PrepareRoom
      module_function

      def call(visit:, actor:, request_key:, expected_version:)
        membership = AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :prepare_room)
        Clinic::Authorization.authorize!(actor: actor, practice: visit.practice, action: "encounters.write",
          site: visit.appointment.site)
        setting = Setting.find_by(practice_id: visit.practice_id)
        raise Error.new("The video provider is not configured.", code: "provider_unconfigured", status: :service_unavailable,
          retryable: false) unless Config.configured_for?(setting)

        outcome = Clinic::Idempotency.execute(practice: visit.practice, actor: actor, operation_code: "telehealth.prepare_room",
          request_key: request_key, resource: visit, authorization_action: "telehealth.host",
          authorization: -> { AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice }, visit: visit, action: :prepare_room) },
          result_resource: ->(command) { command },
          resource_resolver: ->(practice:, receipt:) { Command.find_by(practice_id: practice.id, id: receipt.resource_id) },
          payload: { visit_id: visit.id, expected_version: expected_version }) do
          appointment = visit.practice.appointments.lock.find(visit.appointment_id)
          locked = Visit.lock.find(visit.id)
          raise ActiveRecord::StaleObjectError.new(locked, "update") unless locked.lock_version == expected_version.to_i
          raise Error.new("Start the encounter before preparing the room.", code: "encounter_required") unless locked.encounter&.status == "open"
          if locked.current_room_attempt&.status.in?(%w[pending provisioning ready active ending unknown])
            raise Error.new("A room operation is already active.", code: "room_already_active", status: :conflict)
          end
          attempt_no = locked.room_attempts.maximum(:attempt_no).to_i + 1
          expires_at = [ appointment.ends_at + locked.policy_version.join_late_minutes.minutes,
            Time.current + locked.policy_version.max_room_minutes.minutes ].min
          room = locked.room_attempts.create!(practice_id: locked.practice_id, attempt_no: attempt_no,
            provider_code: setting.provider_code,
            provider_account_ref: setting.provider_account_ref, provider_room_name: "apply_#{SecureRandom.hex(20)}",
            status: "pending", access_generation: locked.access_generation, expires_at: expires_at)
          locked.update!(current_room_attempt_id: room.id)
          locked.commands.create!(practice_id: locked.practice_id, room_attempt_id: room.id, kind: "create_room",
            dedupe_key: "create:#{locked.access_generation}:#{room.id}", access_generation: locked.access_generation,
            status: "pending", available_at: Time.current)
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
