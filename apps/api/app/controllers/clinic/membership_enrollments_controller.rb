module Clinic
  class MembershipEnrollmentsController < Clinic::ApiController
    wrap_parameters false

    before_action -> { require_capability("subscriptions.review") }

    rescue_from MembershipGrowth::CaptureProspect::Conflict do |error|
      render json: { error: error.message, code: "idempotency_conflict" }, status: :conflict
    end
    rescue_from MembershipGrowth::TransitionProspect::InvalidTransition do |error|
      render json: { error: error.message, code: "invalid_transition" }, status: :unprocessable_entity
    end
    rescue_from Clinic::Billing::StripeGateway::Unavailable do |error|
      render json: { error: error.message, code: "stripe_unavailable" }, status: :service_unavailable
    end
    rescue_from Clinic::Billing::StripeGateway::Invalid, ArgumentError do |error|
      render json: { error: error.message, code: "stripe_invalid" }, status: :unprocessable_entity
    end

    def show
      Clinic::AuditRecorder.record!(
        practice: current_practice,
        actor: current_user,
        action_code: "membership_prospects.staff_enrollment_options",
        outcome: :released
      )
      render json: {
        practice: { name: current_practice.name },
        catalog: Care::SubscriptionProjection.catalog(practice: current_practice)
      }
    end

    def create
      input = parameter_hash!(:enrollment,
        %i[version_id display_name email_address phone_number contact_consent request_key], arrays: [ :selections ])
      result = MembershipGrowth::StaffEnrollment.call(
        practice: current_practice,
        actor: current_user,
        version_id: input.require(:version_id),
        selections: input[:selections] || [],
        display_name: input.require(:display_name),
        email_address: input.require(:email_address),
        phone_number: input[:phone_number],
        contact_consent: boolean_param(input[:contact_consent], field: :contact_consent),
        request_key: input.require(:request_key)
      )
      render json: {
        prospect: MembershipProspectSerializer.call(result.prospect),
        replayed: result.replayed
      }, status: result.replayed ? :ok : :created
    end

    def payment
      input = parameter_hash!(:payment, %i[lock_version authorization_confirmed authorization_version])
      result = MembershipGrowth::StaffEnrollmentPayment.start(
        practice: current_practice,
        actor: current_user,
        prospect_id: requested_id!(params[:id], :id),
        lock_version: input.require(:lock_version),
        authorization_confirmed: input[:authorization_confirmed] == true,
        authorization_version: required_string!(input[:authorization_version], field: :authorization_version, maximum: 80)
      )
      render json: {
        prospect: MembershipProspectSerializer.call(result.prospect),
        phone_payment: result.payment
      }, status: :accepted
    end
  end
end
