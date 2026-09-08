module Clinic
  module Telehealth
    module DispatchCommand
      LEASE_DURATION = 30.seconds
      CURRENT_ROOM_COMMANDS = %w[create_room extend_room].freeze
      module_function

      def claim(command, at: Time.current)
        command.with_lock do
          if command.leased? && command.leased_until && command.leased_until <= at
            command.update!(status: "unknown", completed_at: at, last_error_code: "lease_expired",
              lease_token: nil, leased_until: nil)
            return nil
          end
          return nil unless command.pending? && command.available_at <= at
          token = SecureRandom.uuid
          command.update!(status: "leased", lease_token: token, leased_until: at + LEASE_DURATION,
            last_attempt_at: at, attempt_count: command.attempt_count + 1)
          token
        end
      end

      def call(command:, lease_token:)
        snapshot = command.reload
        unless snapshot.leased? && snapshot.lease_token == lease_token && snapshot.leased_until > Time.current
          raise Error.new("The provider command lease is stale.", code: "stale_command_lease", status: :conflict)
        end
        snapshot = preflight(snapshot, lease_token)
        return snapshot unless snapshot.leased?

        result = dispatch(snapshot)
        finalize(command, lease_token, result)
      rescue Providers::Daily::Unavailable
        finalize(command, lease_token, status: "unknown", error: "provider_outcome_unknown")
      rescue Providers::Daily::Rejected => error
        finalize(command, lease_token, status: "failed", error: "provider_rejected")
      rescue Providers::Daily::Unsupported
        finalize(command, lease_token, status: "unknown", error: "provider_operation_unsupported")
      end

      def project_unknown!(command)
        return if command.eject_participant? || !command.room_attempt_id
        ApplicationRecord.transaction do
          seed = Command.find(command.id)
          visit_seed = Visit.find(seed.visit_id)
          visit_seed.practice.appointments.lock.find(visit_seed.appointment_id)
          visit = Visit.lock.find(seed.visit_id)
          room = RoomAttempt.lock.find(seed.room_attempt_id)
          current = Command.lock.find(seed.id)
          next unless current.unknown?
          next if room.ended? || room.failed?
          projected_status = current.end_room? || current.delete_room? || room.ending? ? "ending" : "unknown"
          room.update!(status: projected_status, last_error_code: current.last_error_code)
        end
      end

      def preflight(command, lease_token)
        ApplicationRecord.transaction do
          seed = Command.find(command.id)
          visit_seed = Visit.find(seed.visit_id)
          visit_seed.practice.appointments.lock.find(visit_seed.appointment_id)
          visit = Visit.lock.find(seed.visit_id)
          room = seed.room_attempt_id && RoomAttempt.lock.find(seed.room_attempt_id)
          current = Command.lock.find(seed.id)
          unless current.leased? && current.lease_token == lease_token && current.leased_until > Time.current
            raise Error.new("The provider command lease is stale.", code: "stale_command_lease", status: :conflict)
          end
          return current unless CURRENT_ROOM_COMMANDS.include?(current.kind) && obsolete_current_room_command?(
            command: current, visit: visit, room: room
          )

          current.update!(status: "suppressed", completed_at: Time.current,
            last_error_code: "stale_access_generation", lease_token: nil, leased_until: nil)
          if current.create_room?
            room&.update!(status: "failed", last_error_code: "stale_access_generation")
            visit.commands.where(room_attempt_id: room&.id, kind: "end_room", status: "pending").find_each do |cleanup|
              cleanup.update!(status: "suppressed", completed_at: Time.current,
                last_error_code: "provider_room_not_created")
            end
          end
          current
        end
      end

      def obsolete_current_room_command?(command:, visit:, room:)
        current_generation = room && visit.current_room_attempt_id == room.id &&
          visit.access_generation == command.access_generation && room.access_generation == command.access_generation
        return true unless current_generation

        if command.create_room?
          !visit.status.in?(%w[scheduled in_progress]) || !room.status.in?(%w[pending provisioning])
        else
          !visit.in_progress? || !room.status.in?(%w[ready active])
        end
      end

      def suppress!(command, reason:)
        ApplicationRecord.transaction do
          seed = Command.find(command.id)
          visit_seed = Visit.find(seed.visit_id)
          visit_seed.practice.appointments.lock.find(visit_seed.appointment_id)
          Visit.lock.find(seed.visit_id)
          room = seed.room_attempt_id && RoomAttempt.lock.find(seed.room_attempt_id)
          current = Command.lock.find(seed.id)
          next unless current.pending? || current.leased?
          current.update!(status: "suppressed", completed_at: Time.current, last_error_code: reason,
            lease_token: nil, leased_until: nil)
          room&.update!(status: "failed", last_error_code: reason) if current.create_room?
        end
      end

      def dispatch(command)
        room = command.room_attempt
        case command.kind
        when "create_room"
          response = Providers::Daily.create_room(name: room.provider_room_name, expires_at: room.expires_at)
          { status: "succeeded", room_url: response.fetch("url") }
        when "end_room" then Providers::Daily.end_room(name: room.provider_room_name) && { status: "succeeded" }
        when "extend_room"
          Providers::Daily.extend_room(name: room.provider_room_name, expires_at: command.requested_expires_at)
          { status: "succeeded", expires_at: command.requested_expires_at }
        when "delete_room" then Providers::Daily.delete_room(name: room.provider_room_name) && { status: "succeeded" }
        when "reconcile_room" then ReconcileRoom.provider_snapshot(room)
        when "eject_participant"
          event = room.provider_events.where(participant_id: command.participant_id).order(occurred_at: :desc).first
          raise Providers::Daily::Unavailable unless event&.provider_session_ref
          Providers::Daily.eject_participant(name: room.provider_room_name, provider_session_ref: event.provider_session_ref)
          { status: "succeeded" }
        end
      end

      def finalize(command, lease_token, result)
        result = result.symbolize_keys
        ApplicationRecord.transaction do
          seed = Command.find(command.id)
          visit_seed = Visit.find(seed.visit_id)
          visit_seed.practice.appointments.lock.find(visit_seed.appointment_id)
          visit = Visit.lock.find(seed.visit_id)
          room = seed.room_attempt_id && RoomAttempt.lock.find(seed.room_attempt_id)
          current = Command.lock.find(seed.id)
          return current unless current.leased? && current.lease_token == lease_token
          current_generation = room && visit.current_room_attempt_id == room.id &&
            visit.access_generation == current.access_generation && room.access_generation == current.access_generation
          current.update!(status: result.fetch(:status), completed_at: Time.current, last_error_code: result[:error],
            lease_token: nil, leased_until: nil)
          apply_success!(current, visit, room, result, current_generation: current_generation) if result[:status] == "succeeded"
          if result[:status] == "unknown"
            unless current.eject_participant? || room&.ended? || room&.failed?
              projected_status = current.end_room? || current.delete_room? || room&.ending? ? "ending" : "unknown"
              room&.update!(status: projected_status, last_error_code: result[:error])
            end
          elsif result[:status] == "failed"
            room&.update!(status: "failed", last_error_code: result[:error]) if current.create_room?
          end
          current
        end
      end

      def apply_success!(command, visit, room, result, current_generation:)
        case command.kind
        when "create_room"
          current_target = current_generation && visit.status.in?(%w[scheduled in_progress]) &&
            room.status.in?(%w[pending provisioning ready active])
          room.update!(status: current_target && room.active? ? "active" : (current_target ? "ready" : "ending"),
            provider_room_url: result.fetch(:room_url), provisioned_at: room.provisioned_at || Time.current,
            last_error_code: nil)
          ReconcileRoom.ensure_historical_cleanup!(visit, room) unless current_target
        when "end_room"
          room&.update!(status: "ending", last_error_code: nil) unless room&.status.in?(%w[ended failed])
          visit.commands.find_or_create_by!(dedupe_key: "reconcile-after-end:#{command.access_generation}:#{room&.id}") do |reconcile|
            reconcile.practice_id = visit.practice_id
            reconcile.room_attempt = room
            reconcile.kind = "reconcile_room"
            reconcile.access_generation = command.access_generation
            reconcile.status = "pending"
            reconcile.available_at = Time.current + 15.seconds
          end
        when "delete_room"
          room&.update!(status: "ending", last_error_code: "provider_delete_unconfirmed_media_end") unless
            room&.status.in?(%w[ended failed])
        when "extend_room"
          room.update!(expires_at: result.fetch(:expires_at), last_error_code: nil)
          ReconcileRoom.ensure_historical_cleanup!(visit, room) unless current_generation
        when "reconcile_room"
          ReconcileRoom.apply_snapshot!(visit: visit, room_attempt: room, snapshot: result)
        end
      end
    end
  end
end
