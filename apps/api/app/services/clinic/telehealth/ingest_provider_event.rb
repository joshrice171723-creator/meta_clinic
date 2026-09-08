require "digest"

module Clinic
  module Telehealth
    module IngestProviderEvent
      SUPPORTED_EVENTS = %w[participant.joined participant.left meeting.started meeting.ended waiting-participant.left].freeze
      module_function

      def call(raw_body:, payload:)
        normalized = Providers::Daily.normalize_event(payload)
        raise Providers::Daily::Rejected, "The provider event type is unsupported." unless
          SUPPORTED_EVENTS.include?(normalized[:event_type])
        room = RoomAttempt.includes(:visit).find_by!(provider_code: "daily",
          provider_account_ref: Config.daily_account_ref, provider_room_name: normalized[:room_name])
        participant = normalized[:provider_subject_id] && room.visit.participants.find_by(
          provider_subject_id: normalized[:provider_subject_id])
        event = nil
        ApplicationRecord.transaction do
          room.visit.appointment.lock!
          visit = Visit.lock.find(room.visit_id)
          locked_room = RoomAttempt.lock.find(room.id)
          event = ProviderEvent.find_by(provider_code: "daily", provider_account_ref: room.provider_account_ref,
            provider_event_id: normalized[:provider_event_id])
          next if event
          event = locked_room.provider_events.create!(practice_id: room.practice_id, participant_id: participant&.id,
            provider_code: "daily", provider_account_ref: room.provider_account_ref,
            provider_event_id: normalized[:provider_event_id], event_type: normalized[:event_type],
            provider_session_ref: normalized[:provider_session_ref], occurred_at: normalized[:occurred_at],
            received_at: Time.current, payload_digest: Digest::SHA256.hexdigest(raw_body),
            normalized_metadata: normalized[:metadata])
          apply!(visit: visit, room: locked_room, participant: participant, type: normalized[:event_type],
            provider_session_ref: normalized[:provider_session_ref], occurred_at: normalized[:occurred_at])
        end
        event
      rescue ActiveRecord::RecordNotUnique
        ProviderEvent.find_by!(provider_code: "daily", provider_account_ref: Config.daily_account_ref,
          provider_event_id: normalized.fetch(:provider_event_id))
      end

      def apply!(visit:, room:, participant:, type:, provider_session_ref:, occurred_at:)
        current_generation = visit.current_room_attempt_id == room.id && visit.access_generation == room.access_generation
        case type
        when "meeting.started"
          return unless current_generation && visit.status.in?(%w[scheduled in_progress]) &&
            room.status.in?(%w[pending provisioning ready active])
          room.update!(status: "active", started_at: room.started_at || Time.current, last_error_code: nil)
          visit.update!(status: "in_progress", first_started_at: visit.first_started_at || Time.current) if visit.scheduled?
        when "participant.joined"
          return unless current_generation && visit.status.in?(%w[scheduled in_progress]) &&
            room.status.in?(%w[pending provisioning ready active])
          participant&.update!(last_seen_at: Time.current)
          room.update!(status: "active", started_at: room.started_at || Time.current, last_error_code: nil)
          visit.update!(status: "in_progress", first_started_at: visit.first_started_at || Time.current) if visit.scheduled?
        when "participant.left"
          return unless current_generation && visit.status.in?(%w[scheduled in_progress]) &&
            room.status.in?(%w[pending provisioning ready active])
          leave_participant!(visit, room, participant, provider_session_ref: provider_session_ref,
            occurred_at: occurred_at)
        when "meeting.ended"
          room.update!(status: "ended", ended_at: room.ended_at || Time.current, last_error_code: nil)
          return unless current_generation && !visit.status.in?(%w[ended cancelled no_show])

          visit.join_grants.where(revoked_at: nil).find_each do |grant|
            grant.update!(revoked_at: Time.current, revocation_reason: "provider_meeting_ended")
          end
          visit.participants.where.not(status: "removed").find_each do |value|
            value.update!(status: "left", last_seen_at: Time.current)
          end
          visit.update!(status: "ended", last_ended_at: visit.last_ended_at || Time.current,
            scribe_capture_owner_participant_id: nil, scribe_capture_owner_token_digest: nil,
            scribe_capture_lease_expires_at: nil, scribe_capture_epoch: visit.scribe_capture_epoch + 1)
        end
      end

      def leave_participant!(visit, room, participant, provider_session_ref:, occurred_at:)
        return unless participant
        latest_join = room.provider_events.where(participant_id: participant.id, event_type: "participant.joined")
          .order(occurred_at: :desc, id: :desc).first
        if latest_join
          newer_join = latest_join.occurred_at > occurred_at
          different_active_session = provider_session_ref.present? && latest_join.provider_session_ref.present? &&
            latest_join.provider_session_ref != provider_session_ref
          return if newer_join || different_active_session
        end
        visit.commands.where(participant_id: participant.id, kind: "eject_participant", status: "unknown").find_each do |command|
          command.update!(status: "succeeded", completed_at: command.completed_at || Time.current,
            last_error_code: nil)
        end
        participant.update!(status: "left", last_seen_at: Time.current) unless participant.removed?
        participant.join_grants.where(revoked_at: nil).find_each do |grant|
          grant.update!(revoked_at: Time.current, revocation_reason: "provider_participant_left")
        end
        if visit.scribe_capture_owner_participant_id == participant.id
          visit.update!(scribe_capture_owner_participant_id: nil, scribe_capture_owner_token_digest: nil,
            scribe_capture_lease_expires_at: nil, scribe_capture_epoch: visit.scribe_capture_epoch + 1)
        end
      end
    end
  end
end
