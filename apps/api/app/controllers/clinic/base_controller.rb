module Clinic
  class BaseController < ApplicationController
    before_action :require_prototype
    before_action :require_member
    before_action :require_clinic

    rescue_from ActiveRecord::RecordInvalid do |error|
      render_error(error.record.errors.full_messages.to_sentence, :unprocessable_entity)
    end

    private

    def render_error(message, status)
      render json: { error: message }, status: status
    end

    def require_prototype
      render_error("The clinic workspace is a local synthetic prototype and is not released.", :not_found) if Rails.env.production?
    end

    def clinic_membership
      @clinic_membership ||= Membership.active.find_by(user: current_user)
    end

    def current_practice
      clinic_membership&.practice
    end

    def require_clinic
      render_error("No active clinic assignment. Ask your developer to provision access.", :forbidden) unless clinic_membership
    end

    def require_capability(capability)
      render_error("Your clinic account does not have access to this section.", :forbidden) unless clinic_membership.public_send(capability)
    end
  end
end
