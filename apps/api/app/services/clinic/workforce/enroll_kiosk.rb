module Clinic
  module Workforce
    class EnrollKiosk
      class Rejected < StandardError; end
      Result = Data.define(:kiosk_session, :token)

      def self.call(enrollment_token:, now: Current.business_time)
        digest = IssueBadge.digest(enrollment_token)
        KioskEnrollment.transaction do
          enrollment = KioskEnrollment.lock.find_by(token_digest: digest)
          raise Rejected, "Enrollment code is invalid or expired" unless enrollment&.available?(at: now)
          raise Rejected, "Clock kiosk is unavailable for this site" unless enrollment.site.status == "active"
          settings = EffectiveSettings.call(practice: enrollment.practice, site: enrollment.site, at: now)
          raise Rejected, "Clock kiosk is disabled for this site" unless settings.fetch(:values).fetch("kiosk_enabled", false)

          raw_session = SecureRandom.urlsafe_base64(32, false)
          kiosk_session = KioskSession.create!(
            practice: enrollment.practice,
            site: enrollment.site,
            kiosk_enrollment: enrollment,
            session_digest: IssueBadge.digest(raw_session),
            expires_at: now + 30.days,
            last_seen_at: now
          )
          enrollment.update!(status: "enrolled", enrolled_at: now)
          Result.new(kiosk_session: kiosk_session, token: raw_session)
        end
      end
    end
  end
end
