module Clinic
  module Workforce
    class BadgesController < Clinic::Workforce::BaseController
      def index
        employments, site = authorized_employments("workforce.badges")
        badges = BadgeCredential.where(practice_id: current_practice.id, employment_id: employments.select(:id))
          .includes(employment: :staff_member).order(created_at: :desc)
        render json: {
          badges: badges.map { |badge| ClockSerializer.badge(badge).merge(employee_name: badge.employment.staff_member.display_name) },
          employees: employments.includes(:staff_member, membership: :user).map do |employment|
            { id: employment.id, employee_name: employment.staff_member.display_name,
              active_for_work: employment.active_for_work? }
          end,
          site_id: site&.id
        }
      end

      def create
        employment = Employment.where(practice_id: current_practice.id).find(requested_id!(params[:employment_id], :employment_id))
        site = authorize_employment!(employment, "workforce.badges", require_active: true)
        settings = EffectiveSettings.call(practice: current_practice, site: site).fetch(:values)
        raise ArgumentError, "A PIN is required for badges used at this site" if settings.fetch("pin_required", false) && params[:pin].blank?
        result = IssueBadge.call(employment: employment, actor_membership: clinic_membership, pin: params[:pin])
        render json: {
          badge: ClockSerializer.badge(result.badge).merge(employee_name: employment.staff_member.display_name),
          printable: { token: result.token, barcode_svg: result.barcode_svg, reprintable: false }
        }, status: :created
      end

      def revoke
        badge = BadgeCredential.where(practice_id: current_practice.id).find(requested_id!(params[:id], :id))
        authorize_employment!(badge.employment, "workforce.badges", require_active: false)
        badge.with_lock do
          badge.update!(status: "revoked", revoked_at: Current.business_time, revoked_by_membership: clinic_membership) if badge.active?
        end
        render json: { badge: ClockSerializer.badge(badge.reload) }
      end

      private

      def authorized_employments(permission)
        if workforce_access.allow?(permission)
          scope = Employment.where(practice_id: current_practice.id)
          return [ scope, nil ] unless params[:site_id].present?

          site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
          return [ scope.joins(:employment_sites)
            .where(clinic_workforce_employment_sites: { site_id: site.id, active: true }).distinct, site ]
        end

        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        workforce_access.authorize!(permission, site: site)
        [ Employment.where(practice_id: current_practice.id).joins(:employment_sites)
            .where(clinic_workforce_employment_sites: { site_id: site.id, active: true }).distinct, site ]
      end

      def authorize_employment!(employment, permission, require_active:)
        site_id = requested_id!(params[:site_id], :site_id)
        site = current_practice.sites.find(site_id)
        workforce_access.authorize!(permission, site: site) unless workforce_access.allow?(permission)
        assigned = employment.employment_sites.where(site_id: site.id).exists?
        raise Clinic::Authorization::Denied unless assigned
        raise Clinic::Authorization::Denied if require_active && !employment.eligible_site?(site)
        site
      end
    end
  end
end
