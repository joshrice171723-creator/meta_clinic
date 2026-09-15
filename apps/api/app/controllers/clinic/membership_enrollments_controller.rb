module Clinic
  class MembershipEnrollmentsController < Clinic::ApiController
    wrap_parameters false

    before_action -> { require_capability("subscriptions.review") }

    rescue_from MembershipGrowth::CaptureProspect::Conflict do |error|
      render json: { error: error.message, code: "idempotency_conflict" }, status: :conflict
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
  end
end
