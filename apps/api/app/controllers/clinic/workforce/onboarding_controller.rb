module Clinic
  module Workforce
    class OnboardingController < BaseController
      before_action -> { workforce_access.authorize!("workforce.admin") }

      def create
        input = parameter_hash!(:employee_invitation,
          %i[staff_member_id email_address effective_from], arrays: %i[site_ids])
        result = EmployeeOnboarding.invite!(
          practice: current_practice,
          staff_member: current_practice.staff_members.find(integer_id!(input[:staff_member_id], field: :staff_member_id)),
          email_address: required_string!(input[:email_address], field: :email_address, maximum: 254),
          site_ids: input[:site_ids],
          effective_from: time_param!(input[:effective_from], field: :effective_from),
          actor: current_user
        )
        invitation = result.fetch(:invitation)
        render json: {
          invitation: {
            id: invitation.id,
            staff_member_id: invitation.staff_member_id,
            email_address: invitation.email_address,
            expires_at: invitation.expires_at.iso8601,
            activation_token_once: result.fetch(:token)
          }
        }, status: :created
      end

      def update
        input = parameter_hash!(:employee_invitation, %i[action])
        action = enum_param!(input[:action], field: :action, allowed: %w[revoke])
        invitation = EmployeeInvitation.where(practice_id: current_practice.id)
          .find(integer_id!(params[:id], field: :id))
        invitation = EmployeeOnboarding.revoke!(invitation: invitation, actor: current_user) if action == "revoke"
        render json: { invitation: { id: invitation.id, status: invitation.status, revoked_at: invitation.revoked_at&.iso8601 } }
      end
    end
  end
end
