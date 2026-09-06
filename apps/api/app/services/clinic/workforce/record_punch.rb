module Clinic
  module Workforce
    class RecordPunch
      class Conflict < StandardError
        attr_reader :allowed_transitions
        def initialize(message, allowed_transitions: [])
          @allowed_transitions = allowed_transitions
          super(message)
        end
      end

      Result = Data.define(:punch, :replayed)
      DEBOUNCE_WINDOW = 3.seconds

      def self.call(kiosk_session:, challenge_token:, event_type:, request_key:, now: Time.current)
        request_key = request_key.to_s
        raise ArgumentError, "A valid request key is required" unless request_key.match?(/\A[0-9a-f-]{36}\z/i)
        raise ArgumentError, "Unsupported punch action" unless Punch::EVENTS.include?(event_type)

        challenge_digest = IssueBadge.digest(challenge_token)
        payload_digest = Digest::SHA256.hexdigest([ kiosk_session.id, challenge_digest, event_type ].join(":"))
        prior = Punch.find_by(practice_id: kiosk_session.practice_id, request_key: request_key)
        if prior
          raise Conflict, "That request key was used for different clock data" unless ActiveSupport::SecurityUtils.secure_compare(prior.payload_digest, payload_digest)
          return Result.new(punch: prior, replayed: true)
        end

        Punch.transaction do
          challenge = PunchChallenge.lock.find_by!(
            practice_id: kiosk_session.practice_id,
            kiosk_session_id: kiosk_session.id,
            challenge_digest: challenge_digest
          )
          employment = challenge.employment
          employment.lock!
          prior = Punch.find_by(practice_id: kiosk_session.practice_id, request_key: request_key)
          return Result.new(punch: prior, replayed: true) if prior&.payload_digest == payload_digest

          raise Conflict, "This scan expired. Scan the badge again." unless challenge.usable?(at: now)
          raise Conflict, "This kiosk session is no longer active." unless kiosk_session.active?(at: now)
          raise Conflict, "This employee is not eligible to clock here." unless employment.active_for_work?(at: now) && employment.eligible_site?(kiosk_session.site, at: now)
          badge = BadgeCredential.active.find_by(id: challenge.credential_id, employment_id: employment.id, practice_id: employment.practice_id)
          raise Conflict, "This badge is no longer active. Scan the current badge." unless badge

          settings = EffectiveSettings.call(practice: kiosk_session.practice, site: kiosk_session.site, at: now).fetch(:values)
          raise Conflict, "Clock kiosk is unavailable." unless settings.fetch("kiosk_enabled", false)

          allowed = allowed_transitions(employment: employment)
          allowed -= %w[break_start break_end] unless settings.fetch("break_tracking_enabled", false)
          allowed &= challenge.transitions
          raise Conflict.new("That action is not valid for the employee's current clock state.", allowed_transitions: allowed) unless allowed.include?(event_type)
          last = latest_punch(employment)
          if last && last.created_at > now - DEBOUNCE_WINDOW
            raise Conflict.new("The prior clock action is still settling. Wait a moment and scan again.", allowed_transitions: allowed)
          end
          if last && open_state?(last.event_type) && last.site_id != kiosk_session.site_id
            raise Conflict.new("The open shift belongs to another site. Ask a manager to review it.", allowed_transitions: allowed)
          end

          zone_name = kiosk_session.site.timezone_override.presence || kiosk_session.practice.timezone
          zone = ActiveSupport::TimeZone[zone_name] || ActiveSupport::TimeZone["UTC"]
          local = now.in_time_zone(zone)
          result_snapshot = {
            "event_type" => event_type,
            "occurred_at_utc" => now.utc.iso8601(6),
            "site_id" => kiosk_session.site_id,
            "allowed_transitions" => next_transitions(event_type)
          }
          punch = Punch.create!(
            practice: kiosk_session.practice,
            site: kiosk_session.site,
            employment: employment,
            kiosk_session: kiosk_session,
            punch_challenge: challenge,
            event_type: event_type,
            occurred_at_utc: now.utc,
            time_zone: zone.tzinfo.name,
            utc_offset_seconds: local.utc_offset,
            local_date: local.to_date,
            request_key: request_key,
            payload_digest: payload_digest,
            correlation_id: SecureRandom.uuid,
            received_at: now,
            result_snapshot: result_snapshot
          )
          challenge.update!(consumed_at: now)
          Result.new(punch: punch, replayed: false)
        end
      rescue ActiveRecord::RecordNotUnique
        prior = Punch.find_by!(practice_id: kiosk_session.practice_id, request_key: request_key)
        raise Conflict, "That request key was used for different clock data" unless prior.payload_digest == payload_digest
        Result.new(punch: prior, replayed: true)
      end

      def self.allowed_transitions(employment:)
        next_transitions(latest_punch(employment)&.event_type)
      end

      def self.latest_punch(employment)
        Punch.where(practice_id: employment.practice_id, employment_id: employment.id)
          .order(occurred_at_utc: :desc, id: :desc).first
      end

      def self.next_transitions(last_event)
        case last_event
        when "clock_in", "break_end" then %w[break_start clock_out]
        when "break_start" then %w[break_end]
        else %w[clock_in]
        end
      end

      def self.open_state?(event_type)
        %w[clock_in break_start break_end].include?(event_type)
      end
      private_class_method :latest_punch, :next_transitions, :open_state?
    end
  end
end
