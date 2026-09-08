module Clinic
  module PatientPortal
    class InvitationsController < Clinic::ApiController
      before_action :require_synthetic_portal
      before_action -> { require_capability_with_legacy("patient_portal.identity.invite", "roles.manage") }

      def create
        input = parameter_hash!(:patient_portal_invitation, %i[patient_id user_id])
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        user = User.active.find(requested_id!(input[:user_id], :user_id))
        result = InviteIdentity.call(practice: current_practice, patient:, user:, actor: current_user)
        identity = result.fetch(:identity)
        render json: { invitation: {
          identity_id: identity.id,
          status: identity.status,
          expires_at: identity.invitation_expires_at.iso8601(6),
          activation_path: "/patient-portal/activate#token=#{ERB::Util.url_encode(result.fetch(:token))}"
        } }, status: :created
      end

      private

      def require_synthetic_portal
        render_error("Patient portal lifecycle is unavailable.", :not_found) unless Rails.env.test? || DevelopmentAccess.allowed?(request)
      end
    end
  end
end
