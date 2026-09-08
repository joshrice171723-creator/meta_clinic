module Clinic
  module Telehealth
    module ReconcileRoom
      module_function

      def provider_snapshot(room_attempt)
        locator = room_attempt.provider_room_ref.presence || room_attempt.provider_room_name
        Providers.fetch(room_attempt.provider_code).room_snapshot(name: locator).merge(
          status: "succeeded"
        )
      rescue Providers::NotFound
        { status: "succeeded", exists: false }
      end

      def apply_snapshot!(visit:, room_attempt:, snapshot:)
        current_generation = current_generation?(visit, room_attempt)
        if current_generation && (terminal_visit?(visit) || room_attempt.status.in?(%w[ended failed]))
          terminal_observation!(room_attempt, snapshot)
          return
        end

        if snapshot[:exists]
          expires_at = snapshot[:expires_at] && Time.at(snapshot[:expires_at].to_i)
          reconcile_ejections!(room_attempt, snapshot)
          empty_presence = snapshot[:presence_confirmed] && snapshot[:presence_count].to_i.zero?
          if current_generation && (visit.ending? && empty_presence || snapshot[:provider_ended])
            room_attempt.update!(status: "ended", ended_at: room_attempt.ended_at || Time.current,
              last_reconciled_at: Time.current, last_error_code: nil)
            end_current_visit!(visit)
            return
          end

          unless current_generation
            ensure_historical_cleanup!(visit, room_attempt)
            projected_status = empty_presence ? "ended" : historical_status(room_attempt)
            room_attempt.update!(status: projected_status,
              provider_room_url: snapshot[:room_url] || room_attempt.provider_room_url,
              expires_at: expires_at || room_attempt.expires_at,
              ended_at: (room_attempt.ended_at || Time.current if projected_status == "ended"),
              last_reconciled_at: Time.current, last_error_code: nil)
            return
          end

          projected_status = visit.ending? ? "ending" : (room_attempt.active? ? "active" : "ready")
          room_attempt.update!(status: projected_status,
            provider_room_url: snapshot[:room_url] || room_attempt.provider_room_url,
            expires_at: expires_at || room_attempt.expires_at, last_reconciled_at: Time.current, last_error_code: nil)
        else
          projected_status = (current_generation && visit.ending?) || room_attempt.ending? ? "ending" : "unknown"
          room_attempt.update!(status: projected_status, last_reconciled_at: Time.current,
            last_error_code: "provider_room_absent_without_end_event")
        end
      end

      def current_generation?(visit, room_attempt)
        visit.current_room_attempt_id == room_attempt.id && visit.access_generation == room_attempt.access_generation
      end

      def terminal_visit?(visit)
        visit.status.in?(%w[ended cancelled no_show])
      end

      def terminal_observation!(room_attempt, snapshot)
        attributes = { last_reconciled_at: Time.current }
        if snapshot[:exists]
          attributes[:provider_room_url] = snapshot[:room_url] if snapshot[:room_url]
          attributes[:expires_at] = Time.at(snapshot[:expires_at].to_i) if snapshot[:expires_at]
        else
          attributes[:last_error_code] = "provider_room_absent_without_end_event"
        end
        room_attempt.update!(attributes)
      end

      def historical_status(room_attempt)
        return room_attempt.status if room_attempt.status.in?(%w[ended failed])

        "ending"
      end

      def ensure_historical_cleanup!(visit, room_attempt)
        return if visit.commands.where(room_attempt_id: room_attempt.id, kind: "end_room",
          status: %w[pending leased succeeded unknown]).exists?

        visit.commands.find_or_create_by!(dedupe_key: "cleanup-stale-room:#{room_attempt.access_generation}:#{room_attempt.id}") do |command|
          command.practice_id = visit.practice_id
          command.room_attempt = room_attempt
          command.kind = "end_room"
          command.access_generation = room_attempt.access_generation
          command.status = "pending"
          command.available_at = Time.current
        end
      end

      def reconcile_ejections!(room_attempt, snapshot)
        return unless snapshot[:presence_confirmed] && snapshot[:presence_identifiers_complete]
        present = Array(snapshot[:provider_subject_ids])
        room_attempt.commands.where(kind: "eject_participant", status: "unknown").includes(:participant).find_each do |command|
          next if present.include?(command.participant&.provider_subject_id)
          command.update!(status: "succeeded", completed_at: command.completed_at || Time.current,
            last_error_code: nil)
        end
      end

      def end_current_visit!(visit)
        visit.join_grants.where(revoked_at: nil).find_each do |grant|
          grant.update!(revoked_at: Time.current, revocation_reason: "provider_meeting_ended")
        end
        visit.participants.where.not(status: "removed").find_each do |participant|
          participant.update!(status: "left", last_seen_at: Time.current)
        end
        visit.update!(status: "ended", last_ended_at: visit.last_ended_at || Time.current,
          scribe_capture_owner_participant_id: nil, scribe_capture_owner_token_digest: nil,
          scribe_capture_lease_expires_at: nil, scribe_capture_epoch: visit.scribe_capture_epoch + 1)
      end
    end
  end
end
