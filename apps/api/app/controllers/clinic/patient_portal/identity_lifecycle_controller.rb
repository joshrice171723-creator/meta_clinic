module Clinic
  module PatientPortal
    class IdentityLifecycleController < Clinic::ApiController
      before_action :require_synthetic_portal
      before_action -> { require_capability_with_legacy("patient_portal.identity.revoke", "roles.manage") }

      def revoke
        identity = Identity.for_practice(current_practice).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:revocation, %i[reason])
        reason = required_string!(input[:reason], field: :reason, maximum: 1_000)
        updated = RevokeIdentity.call(identity:, actor: current_user, reason:)
        render json: { identity: {
          id: updated.id, patient_id: updated.patient_id, status: updated.status,
          revoked_at: updated.revoked_at&.iso8601(6), revoked_reason: updated.revoked_reason
        } }
      end

      private

      def require_synthetic_portal
        render_error("Patient portal lifecycle is unavailable.", :not_found) unless Rails.env.test? || DevelopmentAccess.allowed?(request)
      end
    end
  end
end
