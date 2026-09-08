module Clinic
  module Workforce
    class KiosksController < Clinic::Workforce::BaseController
      ENROLLMENT_LIFETIME = 24.hours

      def index
        scope = KioskEnrollment.where(practice_id: current_practice.id).includes(:site)
        unless workforce_access.allow?("workforce.settings")
          site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
          workforce_access.authorize!("workforce.settings", site: site)
          scope = scope.where(site_id: site.id)
        end
        render json: { kiosks: scope.order(created_at: :desc).map { |enrollment| ClockSerializer.kiosk(enrollment) } }
      end

      def create
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        workforce_access.authorize!("workforce.settings", site: workforce_access.allow?("workforce.settings") ? nil : site)
        settings = EffectiveSettings.call(practice: current_practice, site: site).fetch(:values)
        raise ArgumentError, "Clock kiosk is disabled for this site" unless settings.fetch("kiosk_enabled", false)
        token = SecureRandom.urlsafe_base64(32, false)
        enrollment = KioskEnrollment.create!(
          practice: current_practice,
          site: site,
          token_digest: IssueBadge.digest(token),
          issued_by_membership: clinic_membership,
          expires_at: Current.business_time + ENROLLMENT_LIFETIME
        )
        render json: { kiosk: ClockSerializer.kiosk(enrollment), enrollment_token: token }, status: :created
      end

      def revoke
        enrollment = KioskEnrollment.where(practice_id: current_practice.id).includes(:site).find(requested_id!(params[:id], :id))
        workforce_access.authorize!("workforce.settings", site: workforce_access.allow?("workforce.settings") ? nil : enrollment.site)
        KioskEnrollment.transaction do
          enrollment.lock!
          enrollment.update!(status: "revoked", revoked_at: Current.business_time, revoked_by_membership: clinic_membership) unless enrollment.status == "revoked"
          enrollment.kiosk_sessions.where(status: "active").find_each do |session_record|
            session_record.update!(status: "revoked", revoked_at: Current.business_time)
          end
        end
        render json: { kiosk: ClockSerializer.kiosk(enrollment.reload) }
      end
    end
  end
end
