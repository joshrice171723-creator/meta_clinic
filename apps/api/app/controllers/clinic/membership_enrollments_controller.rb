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
        %i[version_id display_name email_address phone_number contact_consent request_key billing_mode], arrays: [ :selections ])
      result = MembershipGrowth::StaffEnrollment.call(
        practice: current_practice,
        actor: current_user,
        version_id: input.require(:version_id),
        selections: input[:selections] || [],
        display_name: input.require(:display_name),
        email_address: input.require(:email_address),
        phone_number: input[:phone_number],
        contact_consent: boolean_param(input[:contact_consent], field: :contact_consent),
        request_key: input.require(:request_key),
        billing_mode: input[:billing_mode].presence || "recurring"
      )
      render json: {
        prospect: MembershipProspectSerializer.call(result.prospect),
        one_time_payment: one_time_payment_state(result.prospect),
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

    def one_time_payment
      input = parameter_hash!(:payment, %i[lock_version request_key])
      result = MembershipGrowth::StaffEnrollmentPayment.simulate_one_time(
        practice: current_practice,
        actor: current_user,
        prospect_id: requested_id!(params[:id], :id),
        lock_version: bounded_integer!(
          input[:lock_version], field: :lock_version, min: 0, max: 2_147_483_647
        ),
        request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
      )
      render json: {
        prospect: MembershipProspectSerializer.call(result.prospect),
        one_time_payment: one_time_payment_state(result.prospect)
      }
    end

    private

    def one_time_payment_state(prospect)
      return unless prospect.selected_terms.fetch("renewal") == "none"

      available = Development::MembershipPaymentSimulator.enabled_for?(current_practice)
      paid = prospect.paid_at.present? && prospect.status.in?(%w[paid_onboarding converted])
      instructions = if paid
        "Simulated payment verified. Patient onboarding can continue."
      elsif available
        "Simulate the one-time card payment. Patient onboarding begins only after the signed local event is verified."
      else
        "One-time staff card simulation is not enabled for this clinic. Use an approved production payment workflow."
      end
      {
        status: paid ? "paid" : "ready",
        simulation_available: available,
        vendor_confirmed: false,
        evidence: paid ? "server_signed_local_event" : nil,
        instructions:
      }
    end
  end
end
