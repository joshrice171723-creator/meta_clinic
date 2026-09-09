require "digest"

module Clinic
  module Telehealth
    module IssueJoinGrant
      Result = Data.define(:grant, :token, :room_url, :room_name, :provider)
      Snapshot = Data.define(:visit_id, :participant_id, :room_id, :access_generation, :grant_expires_at,
        :room_expires_at, :room_name, :room_url, :provider, :owner, :allow_screen_share, :request_digest)
      module_function

      def call(visit:, participant:, request_key:, expected_version:, actor: nil, identity: nil)
        validate_request_key!(request_key)
        snapshot = prepare(visit:, participant:, request_key:, expected_version:, actor:, identity:)
        token = Providers.fetch(snapshot.provider).issue_join_token(room_name: snapshot.room_name, participant: participant,
          expires_at: snapshot.grant_expires_at, owner: snapshot.owner,
          allow_screen_share: snapshot.allow_screen_share)
        grant = persist(snapshot:, token:, expected_version:, actor:, identity:)
        Result.new(grant: grant, token: token, room_url: snapshot.room_url, room_name: snapshot.room_name,
          provider: snapshot.provider)
      rescue ActiveRecord::RecordNotUnique
        raise replay_error
      rescue Providers::Unavailable
        raise Error.new("The video provider is unavailable.", code: "provider_unavailable",
          status: :service_unavailable, retryable: true)
      rescue Providers::Rejected, Providers::Unsupported
        raise Error.new("The video provider rejected the join request.", code: "provider_rejected",
          status: :service_unavailable, retryable: false)
      end

      def prepare(visit:, participant:, request_key:, expected_version:, actor:, identity:)
        authorize!(visit:, participant:, actor:, identity:)
        snapshot = nil
        visit.practice.appointments.lock.find(visit.appointment_id).with_lock do
          locked = Visit.lock.find(visit.id)
          raise ActiveRecord::StaleObjectError.new(locked, "update") unless locked.lock_version == expected_version.to_i
          target = locked.participants.lock.find(participant.id)
          room = locked.current_room_attempt && RoomAttempt.lock.find(locked.current_room_attempt_id)
          authorize!(visit: locked, participant: target, actor:, identity:)
          validate_join!(visit: locked, participant: target, room: room)
          grant_expires_at = [ Time.current + locked.policy_version.grant_ttl_seconds.seconds, room.expires_at ].min
          request_digest = Clinic::Idempotency.payload_digest({ request_key: request_key, visit_id: locked.id,
            participant_id: target.id, access_generation: locked.access_generation,
            expected_version: expected_version.to_i })
          raise replay_error if locked.join_grants.exists?(participant_id: target.id,
            access_generation: locked.access_generation, request_digest: request_digest)
          ability = actor && Ability.new(actor, practice: locked.practice)
          owner = target.clinician? &&
            ability&.allowed_permission?("telehealth.host", site: locked.appointment.site)
          snapshot = Snapshot.new(visit_id: locked.id, participant_id: target.id, room_id: room.id,
            access_generation: locked.access_generation, grant_expires_at: grant_expires_at,
            room_expires_at: room.expires_at, room_name: room.provider_room_name,
            room_url: room.provider_room_url, provider: room.provider_code, owner: !!owner,
            allow_screen_share: !!owner && locked.policy_version.allow_staff_screen_share?,
            request_digest: request_digest)
        end
        snapshot
      end

      def persist(snapshot:, token:, expected_version:, actor:, identity:)
        visit = Visit.find(snapshot.visit_id)
        grant = nil
        visit.practice.appointments.lock.find(visit.appointment_id).with_lock do
          locked = Visit.lock.find(snapshot.visit_id)
          raise ActiveRecord::StaleObjectError.new(locked, "update") unless locked.lock_version == expected_version.to_i
          room = RoomAttempt.lock.find(snapshot.room_id)
          target = locked.participants.lock.find(snapshot.participant_id)
          authorize!(visit: locked, participant: target, actor:, identity:)
          validate_join!(visit: locked, participant: target, room: room)
          current = locked.access_generation == snapshot.access_generation &&
            locked.current_room_attempt_id == room.id && room.provider_room_name == snapshot.room_name &&
            room.expires_at == snapshot.room_expires_at && snapshot.grant_expires_at > Time.current
          unless current
            raise Error.new("The room changed while the join grant was issued.", code: "stale_room",
              status: :conflict)
          end
          raise replay_error if locked.join_grants.exists?(participant_id: target.id,
            access_generation: locked.access_generation, request_digest: snapshot.request_digest)
          grant = locked.join_grants.create!(practice_id: locked.practice_id, participant_id: target.id,
            room_attempt_id: room.id, access_generation: locked.access_generation,
            token_digest: Digest::SHA256.hexdigest(token), request_digest: snapshot.request_digest,
            issued_at: Time.current, expires_at: snapshot.grant_expires_at)
        end
        grant
      end

      def authorize!(visit:, participant:, actor:, identity:)
        if actor
          membership = AccessPolicy.authorize!(actor_context: { actor: actor, practice: visit.practice },
            visit: visit, action: :participate)
          raise Clinic::Authorization::Denied unless participant.membership_id == membership.id
        else
          PatientIdempotency.validate_context!(identity, visit)
          raise Clinic::Authorization::Denied unless participant.portal_identity_id == identity.id
        end
      end

      def validate_join!(visit:, participant:, room:)
        raise Error.new("Admission is required before joining.", code: "admission_required",
          status: :forbidden) unless participant.admitted?
        raise Error.new("The video room is not ready.", code: "room_not_ready",
          status: :conflict) unless room&.status.in?(%w[ready active])
        raise Error.new("Video access is ending.", code: "visit_ending",
          status: :conflict) unless visit.scheduled? || visit.in_progress?
        unless participant.admitted_generation == visit.access_generation
          raise Error.new("Admission is stale.", code: "stale_admission", status: :conflict)
        end
        if participant.patient?
          preparation = CurrentPreparation.call(visit: visit)
          unless preparation[:complete]
            raise Error.new("Current preparation and consent are required.", code: "preparation_incomplete")
          end
        end
      end

      def validate_request_key!(value)
        return if value.to_s.match?(Clinic::Idempotency::KEY_PATTERN)

        raise Error.new("A valid request key is required.", code: "invalid_request_key",
          status: :bad_request, field: "request_key")
      end

      def replay_error
        Error.new("This one-use join response was already issued. Request another grant with a new request key.",
          code: "join_grant_not_replayable", status: :conflict)
      end
    end
  end
end
