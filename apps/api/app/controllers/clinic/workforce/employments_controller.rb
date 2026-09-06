module Clinic
  module Workforce
    class EmploymentsController < BaseController
      before_action -> { workforce_access.authorize!("workforce.admin") }

      def index
        employments = Employment.where(practice_id: current_practice.id)
          .includes(:staff_member, { membership: :user }, employment_sites: :site).order(:id)
        linked_staff_ids = employments.map(&:staff_member_id)
        linked_membership_ids = employments.map(&:membership_id)
        staff_members = current_practice.staff_members.where(active: true).to_a.sort_by { |member| [ member.display_name.downcase, member.id ] }
        memberships = current_practice.memberships.active.includes(:user).reject { |membership| linked_membership_ids.include?(membership.id) }
          .select { |membership| membership.user.active? }.sort_by { |membership| [ membership.user.email_address, membership.id ] }

        render json: {
          schema_version: 1,
          employments: employments.map { |employment| EmploymentSerializer.call(employment) },
          staff_members: staff_members.map { |member|
            { id: member.id, display_name: member.display_name, job_title: member.job_title,
              linked: linked_staff_ids.include?(member.id) }
          },
          membership_options: memberships.map { |membership|
            { id: membership.id, email_address: membership.user.email_address }
          },
          invitations: EmployeeInvitation.where(practice_id: current_practice.id, status: "pending")
            .includes(:staff_member).order(:expires_at, :id).map { |invitation|
              {
                id: invitation.id,
                staff_member_id: invitation.staff_member_id,
                display_name: invitation.staff_member.display_name,
                email_address: invitation.email_address,
                expires_at: invitation.expires_at.iso8601
              }
            },
          sites: current_practice.sites.where(status: "active").order(:name, :id).map { |site|
            { id: site.id, code: site.code, name: site.name }
          }
        }
      end

      def create
        input = parameter_hash!(:employment, %i[staff_member_id membership_id effective_from], arrays: %i[site_ids])
        employment = LinkEmployment.call(
          practice: current_practice,
          staff_member: current_practice.staff_members.find(integer_id!(input[:staff_member_id], field: :staff_member_id)),
          membership: current_practice.memberships.active.find(integer_id!(input[:membership_id], field: :membership_id)),
          site_ids: input[:site_ids],
          effective_from: time_param!(input[:effective_from], field: :effective_from),
          actor: current_user
        )
        render json: { schema_version: 1, employment: EmploymentSerializer.call(employment) }, status: :created
      end

      def update
        input = parameter_hash!(:employment, %i[status effective_until], arrays: %i[site_ids])
        employment = Employment.where(practice_id: current_practice.id).find(integer_id!(params[:id], field: :id))
        status = input[:status].present? ? enum_param!(input[:status], field: :status, allowed: %w[active inactive]) : nil
        effective_until = if input.key?(:effective_until)
          input[:effective_until].present? ? time_param!(input[:effective_until], field: :effective_until) : nil
        else
          :unchanged
        end
        employment = LinkEmployment.update!(employment: employment, actor: current_user, status: status,
          site_ids: input.key?(:site_ids) ? input[:site_ids] : nil, effective_until: effective_until)
        render json: { schema_version: 1, employment: EmploymentSerializer.call(employment) }
      end
    end
  end
end
