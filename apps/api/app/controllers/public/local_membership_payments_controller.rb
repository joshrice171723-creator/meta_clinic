module Public
  class LocalMembershipPaymentsController < ApplicationController
    include Clinic::Api::RequestParameters
    include MemberAuthentication

    rate_limit to: 20, within: 15.minutes, only: :create, name: "local_membership_payment_submit",
      with: -> { render json: { error: "Too many payment updates. Please try again shortly." }, status: :too_many_requests }
    before_action -> { response.headers["Cache-Control"] = "no-store" }
    before_action :require_member
    before_action :require_local_simulator

    rescue_from Clinic::Api::RequestParameters::Invalid do |error|
      render_parameter_error(error)
    end
    rescue_from ArgumentError do |error|
      render json: { error: error.message, code: "invalid_request" }, status: :unprocessable_entity
    end
    rescue_from Clinic::Billing::StripeGateway::Unavailable do |error|
      render json: { error: error.message, code: "simulator_unavailable" }, status: :service_unavailable
    end
    rescue_from Clinic::Billing::StripeGateway::Invalid do |error|
      render json: { error: error.message, code: "simulator_event_invalid" }, status: :unprocessable_entity
    end
    rescue_from Clinic::AuditRecorder::Unavailable do
      render json: { error: "Required local payment evidence is unavailable." }, status: :service_unavailable
    end

    def create
      input = parameter_hash!(:payment, %i[outcome request_key])
      outcome = required_string!(input[:outcome], field: :outcome, maximum: 40)
      request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
      result = Development::MembershipPaymentSimulator.record!(practice: prospect.practice,
        prospect:, user: current_user, outcome:, request_key:)
      set_patient_portal_session(result.prospect)
      render json: {
        payment: Development::MembershipPaymentSimulator.state(result.prospect).merge(
          event_id: result.event_id,
          redirect_to: patient_portal_redirect(result.prospect)
        )
      }
    end

    private

    def prospect
      @prospect ||= Clinic::MembershipProspect.find_by!(account_user_id: current_user.id, intent_type: "purchase")
    end

    def require_local_simulator
      raise ActiveRecord::RecordNotFound unless (Rails.env.test? || GuidedDemoAccess.allowed?(request)) &&
        Clinic::DeploymentAccess.practice_enabled?(prospect.practice_id) &&
        Development::MembershipPaymentSimulator.enabled_for?(prospect.practice)
    end

    def set_patient_portal_session(record)
      identity = record.portal_identity
      session[:patient_portal_identity_id] = identity.id if record.paid_at && identity&.active? &&
        identity.user_id == current_user.id
    end

    def patient_portal_redirect(record)
      identity = record.portal_identity
      return unless record.paid_at && identity&.active? && identity.user_id == current_user.id

      "/patient-portal?membership_payment=local#onboarding"
    end
  end
end
