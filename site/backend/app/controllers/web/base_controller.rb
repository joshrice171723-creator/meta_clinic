module Web
  class BaseController < ApplicationController
    helper_method :current_user, :development_demo?
    layout "application"

    rescue_from ActionController::InvalidAuthenticityToken do
      render_error("Your session expired. Return to the page and try again.", :unprocessable_entity)
    end
    rescue_from ActiveRecord::RecordNotFound do
      render_error("That page is not available to your account.", :not_found)
    end
    rescue_from ActionController::ParameterMissing do
      render_error("Please complete the required fields.", :bad_request)
    end

    private

    def require_member
      redirect_to login_path, alert: "Please sign in to continue." unless current_user
    end

    def require_admin
      require_member
      return if performed?
      render_error("This page is for APPly administrators.", :forbidden) unless current_user.admin?
    end

    def render_error(message, status)
      @error_message = message
      render "web/pages/error", status: status
    end
  end
end
