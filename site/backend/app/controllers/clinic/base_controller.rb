module Clinic
  class BaseController < Web::BaseController
    layout "clinic"
    before_action :require_prototype
    before_action :require_member
    before_action :require_clinic
    helper_method :clinic_membership, :current_practice

    private

    def require_prototype
      # No deployment flag can enable this synthetic clinical prototype in production.
      render_error("The clinic workspace is a local synthetic prototype and is not released.", :not_found) if Rails.env.production?
    end

    def clinic_membership
      @clinic_membership ||= Membership.active.find_by(user: current_user)
    end

    def current_practice
      clinic_membership&.practice
    end

    def require_clinic
      render "clinic/dashboard/access", status: :forbidden unless clinic_membership
    end

    def require_capability(capability)
      render_error("Your clinic account does not have access to this section.", :forbidden) unless clinic_membership.public_send(capability)
    end
  end
end
