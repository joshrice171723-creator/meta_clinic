module Clinic
  module Workforce
    class ResolveBadgeChallenge
      class Rejected < StandardError; end
      Result = Data.define(:challenge, :token, :employee_label, :permitted_transitions)
      LIFETIME = 60.seconds

      def self.call(kiosk_session:, badge_token:, pin: nil, input_method: "scanner", now: Time.current)
        raise Rejected, "Badge could not be verified" unless kiosk_session.active?(at: now)
        settings = EffectiveSettings.call(practice: kiosk_session.practice, site: kiosk_session.site, at: now)
        values = settings.fetch(:values)
        raise Rejected, "Clock kiosk is unavailable" unless values.fetch("kiosk_enabled", false)
        raise Rejected, "Manual badge entry is disabled" if badge_token.blank?
        enabled_input = {
          "scanner" => values.fetch("scanner_enabled", false),
          "camera" => values.fetch("camera_enabled", false),
          "manual" => values.fetch("manual_badge_entry_enabled", false)
        }
        raise Rejected, "This badge entry method is disabled" unless enabled_input.fetch(input_method.to_s, false)

        badge = BadgeCredential.active.find_by(secret_digest: IssueBadge.digest(badge_token))
        reject_badge! unless badge && badge.practice_id == kiosk_session.practice_id
        employment = badge.employment
        reject_badge! unless employment.active_for_work?(at: now) && employment.eligible_site?(kiosk_session.site, at: now)
        if values.fetch("pin_required", false)
          reject_badge! unless badge.pin_digest.present? && badge.pin_matches?(pin)
        elsif badge.pin_digest.present?
          reject_badge! unless badge.pin_matches?(pin)
        end

        transitions = RecordPunch.allowed_transitions(employment: employment)
        transitions -= %w[break_start break_end] unless values.fetch("break_tracking_enabled", false)
        token = SecureRandom.urlsafe_base64(32, false)
        challenge = PunchChallenge.create!(
          practice: kiosk_session.practice,
          kiosk_session: kiosk_session,
          employment: employment,
          challenge_digest: IssueBadge.digest(token),
          permitted_transitions: transitions + [ "badge:#{badge.id}" ],
          expires_at: now + LIFETIME
        )
        Result.new(
          challenge: challenge,
          token: token,
          employee_label: employment.staff_member.display_name,
          permitted_transitions: transitions
        )
      end

      def self.reject_badge!
        BCrypt::Password.new(User::DUMMY_PASSWORD_DIGEST).is_password?(SecureRandom.hex(8))
        raise Rejected, "Badge could not be verified"
      end
      private_class_method :reject_badge!
    end
  end
end
