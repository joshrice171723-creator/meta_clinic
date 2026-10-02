class ApplicationController < ActionController::Base
  protect_from_forgery with: :exception
  before_action :prevent_caching
  around_action :use_business_date

  rescue_from Identity::SessionAudit::Unavailable do
    render json: { error: "Session security is temporarily unavailable. Please try again.", code: "session_security_unavailable" }, status: :service_unavailable
  end

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

  def use_business_date
    Current.workspace_tools_owner_session = DevelopmentAccess.hosted_owner_session(request)
    if DevelopmentAccess.allowed?(request) && session[:development_business_date].present?
      begin
        Current.business_date = Date.iso8601(session[:development_business_date])
      rescue Date::Error
        session.delete(:development_business_date)
      end
    end
    yield
  ensure
    Current.reset
  end

  def prevent_caching
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
  end

  def current_member_session
    @current_member_session ||= MemberSession.includes(:user).find_by(id: session[:member_session_id])
  end

  def current_user
    record = current_member_session
    return if session[:workspace_tools_owner_session_id] && !Current.workspace_tools_owner_session
    if record && !record.unexpired?
      record.expire_if_inactive!
      session.delete(:member_session_id)
      return
    end
    return if session[:development_demo_user_id] && !development_demo?
    return if record && Development::TestAccounts.reserved_email?(record.user.email_address) &&
      !development_demo? && !patient_portal_session?
    record.user if record && record.unexpired? && record.user.active? &&
      (!Development::TestAccounts.reserved_email?(record.user.email_address) || development_demo? || patient_portal_session?)
  end

  def development_demo?
    return @development_demo if defined?(@development_demo)

    record = current_member_session
    @development_demo = if session[:development_test_profile]
      DevelopmentAccess.allowed?(request) && record &&
        session[:development_demo_user_id] == record.user_id &&
        Development::TestAccounts.matches?(record.user, session[:development_test_profile])
    else
      ((DevelopmentAccess.allowed?(request) &&
        (!session[:sandbox_account] || valid_guided_demo_user?(record))) ||
        (GuidedDemoAccess.hosted? && valid_guided_demo_user?(record))) && record && !record.user.admin? &&
        session[:development_demo_user_id] == record.user_id
    end
  end

  def valid_guided_demo_user?(record)
    run = Development::DemoRun.active.find_by(id: session[:guided_clinic_demo_run_id])
    return false unless run && record
    if session[:sandbox_account] && Development::DemoLessonCatalog.sandbox?(run.lesson_key)
      account = Development::SandboxAccounts.resolve(run, session[:sandbox_account])
      account.user.id == record.user_id
    else
      record.user_id.in?([ run.operator_user_id, run.patient_user_id ].compact)
    end
  rescue ActiveRecord::RecordNotFound
    false
  end

  def development_omni?
    return @development_omni if defined?(@development_omni)

    record = current_member_session
    @development_omni = DevelopmentAccess.allowed?(request) && record &&
      session[:development_test_profile] == "omni" &&
      session[:development_demo_user_id] == record.user_id &&
      Development::TestAccounts.matches?(record.user, "omni")
  end

  def require_member
    render json: { error: "Please sign in to continue." }, status: :unauthorized unless current_user
  end

  def patient_portal_session?
    identity_id = session[:patient_portal_identity_id]
    return false unless identity_id

    Clinic::PatientPortal::Identity.available.exists?(id: identity_id, user_id: current_member_session&.user_id)
  end

  def require_admin
    require_member
    return if performed?
    return if current_user.platform_owner?
    return if development_omni? &&
      (!DevelopmentAccess.public_staging_demo? || session[:public_demo_owner_pin_verified])

    render json: { error: "This page is for Meta Clinic platform owners." }, status: :forbidden
  end
end
