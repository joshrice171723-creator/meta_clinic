class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
  before_action :prevent_caching

  rescue_from ActionController::InvalidAuthenticityToken do
    render json: { error: "Your session expired. Please try again." }, status: :unprocessable_entity
  end
  rescue_from ActiveRecord::RecordNotFound do
    render json: { error: "Not found." }, status: :not_found
  end
  rescue_from ActionController::ParameterMissing do
    render json: { error: "Please complete the required fields." }, status: :bad_request
  end

  private

  def prevent_caching
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
  end

  def current_member_session
    @current_member_session ||= MemberSession.includes(:user).find_by(id: session[:member_session_id])
  end

  def current_user
    record = current_member_session
    return if session[:development_demo_user_id] && !development_demo?
    return if record && Development::TestAccounts.reserved_email?(record.user.email_address) && !development_demo?
    record.user if record && record.unexpired? && record.user.active?
  end

  def development_demo?
    record = current_member_session
    if session[:development_test_profile]
      return DevelopmentAccess.allowed?(request) && record &&
        session[:development_demo_user_id] == record.user_id &&
        Development::TestAccounts.matches?(record.user, session[:development_test_profile])
    end
    DevelopmentAccess.allowed?(request) && record && !record.user.admin? &&
      session[:development_demo_user_id] == record.user_id
  end

  def development_omni?
    record = current_member_session
    DevelopmentAccess.allowed?(request) && record &&
      session[:development_test_profile] == "omni" &&
      session[:development_demo_user_id] == record.user_id &&
      Development::TestAccounts.matches?(record.user, "omni")
  end

  def require_member
    render json: { error: "Please sign in to continue." }, status: :unauthorized unless current_user
  end

  def require_admin
    require_member
    return if performed?
    return if current_user.admin? || development_omni?

    render json: { error: "This page is for APPly administrators." }, status: :forbidden
  end
end
