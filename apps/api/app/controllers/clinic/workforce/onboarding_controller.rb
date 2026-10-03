module Clinic
  module Workforce
    class OnboardingController < BaseController
      before_action -> { workforce_access.authorize!("workforce.admin") }

      def create
        input = parameter_hash!(:employee_invitation,
          %i[staff_member_id display_name job_title email_address role_version_id effective_from], arrays: %i[site_ids])
        staff_member = input[:staff_member_id].present? ?
          current_practice.staff_members.find(integer_id!(input[:staff_member_id], field: :staff_member_id)) : nil
        result = EmployeeOnboarding.invite!(
          practice: current_practice,
          staff_member: staff_member,
          display_name: staff_member ? nil : required_string!(input[:display_name], field: :display_name, maximum: 120),
          job_title: staff_member ? nil : required_string!(input[:job_title], field: :job_title, maximum: 120),
          email_address: required_string!(input[:email_address], field: :email_address, maximum: 254),
          role_version: workforce_role_version(input[:role_version_id]),
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
            activation_token_once: result.fetch(:token),
            activation_path: "/workforce/activate#token=#{ERB::Util.url_encode(result.fetch(:token))}"
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

      private

      def workforce_role_version(value)
        if value.present?
          role_version = RoleVersion.includes(:permissions).find(integer_id!(value, field: :role_version_id))
          return role_version if RoleAssignment.catalogued_role?(role_version)
        else
          role_version = RoleVersion.includes(:permissions)
            .where(role_code: "workforce-employee").order(version: :desc, id: :desc).first
          return role_version if role_version
        end

        raise ArgumentError, "Choose an employee access role."
      end
    end
  end
end
