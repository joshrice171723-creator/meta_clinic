module Web
  class BaseController < ApplicationController
    helper_method :current_user, :development_demo?
    layout "application"

    rescue_from ActionController::InvalidAuthenticityToken do
      @recovery_path = request.path.start_with?("/clinic/pharmacy") ? clinic_pharmacy_index_path : login_path
      @recovery_label = @recovery_path == login_path ? "Return to sign in" : "Return to pharmacy"
      render_error("We could not verify this form. Nothing was saved. Open a fresh page and try again; sign in if prompted.", :unprocessable_entity)
    end
    rescue_from ActiveRecord::RecordNotFound do
      render_error("That page is not available to your account.", :not_found)
    end
    rescue_from ActionController::ParameterMissing do
      render_error("Please complete the required fields.", :bad_request)
    end

    private

    def require_member
      return if current_user

      session[:after_login] = if request.path.start_with?("/clinic/pharmacy")
        "/clinic/pharmacy"
      elsif request.path == "/clinic" || request.path.start_with?("/clinic/")
        "/clinic"
      else
        "/portal"
      end
      redirect_to login_path, alert: "Please sign in to continue."
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
