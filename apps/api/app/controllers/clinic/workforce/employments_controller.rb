module Clinic
  module Workforce
    class EmploymentsController < BaseController
      before_action -> { workforce_access.authorize!("workforce.admin") }

      def index
        employments = Employment.where(practice_id: current_practice.id)
          .includes(:staff_member, { membership: [ :user, { role_grants: :role_version } ] }, employment_sites: :site)
          .order(:id)
        linked_staff_ids = employments.index_by(&:staff_member_id)
        linked_membership_ids = employments.index_by(&:membership_id)
        staff_members = current_practice.staff_members.where(active: true).to_a.sort_by { |member| [ member.display_name.downcase, member.id ] }
        memberships = current_practice.memberships.active.includes(:user).reject { |membership| linked_membership_ids.key?(membership.id) }
          .select { |membership| membership.user.active? && membership.user_id != current_user.id }
          .sort_by { |membership| [ membership.user.email_address, membership.id ] }
        assignment_ability = workforce_access.ability
        role_versions = latest_workforce_role_versions.select do |role_version|
          RoleAssignment.assignable?(actor: current_user, practice: current_practice,
            role_version: role_version, ability: assignment_ability)
        end
        active_work_by_membership = Clinic::ClinicalTask
          .where(practice_id: current_practice.id, assigned_to_membership_id: linked_membership_ids.keys,
            state: Clinic::ClinicalTask::ACTIVE_STATES)
          .group(:assigned_to_membership_id, :site_id).count
          .group_by { |(membership_id, _site_id), _count| membership_id }

        render json: {
          schema_version: 1,
          employments: employments.map do |employment|
            work = active_work_by_membership.fetch(employment.membership_id, []).map do |(_membership_id, site_id), count|
              { site_id:, count: }
            end
            EmploymentSerializer.call(employment).merge(active_work_by_site: work)
          end,
          staff_members: staff_members.map { |member|
            { id: member.id, display_name: member.display_name, job_title: member.job_title,
              linked: linked_staff_ids.key?(member.id) }
          },
          membership_options: memberships.map { |membership|
            { id: membership.id, email_address: membership.user.email_address }
          },
          role_options: role_versions.map { |role_version|
            Clinic::RoleVersionSerializer.call(role_version).merge(
              label: Clinic::Authorization::PilotRoleCatalog.definition(role_version.role_code)&.fetch(:label, nil) ||
                role_version.role_code.sub(/^workforce-/, "").titleize)
          },
          invitations: EmployeeInvitation.where(practice_id: current_practice.id, status: "pending")
            .includes(:staff_member, :role_version).order(:expires_at, :id).map { |invitation|
              {
                id: invitation.id,
                staff_member_id: invitation.staff_member_id,
                display_name: invitation.staff_member.display_name,
                email_address: invitation.email_address,
                role_code: invitation.role_version.role_code,
                expires_at: invitation.expires_at.iso8601
              }
            },
          sites: current_practice.sites.where(status: "active").order(:name, :id).map { |site|
            { id: site.id, code: site.code, name: site.name }
          }
        }
      end

      def create
        input = parameter_hash!(:employment,
          %i[staff_member_id display_name job_title membership_id role_version_id effective_from], arrays: %i[site_ids])
        staff_member = input[:staff_member_id].present? ?
          current_practice.staff_members.find(integer_id!(input[:staff_member_id], field: :staff_member_id)) : nil
        employment = LinkEmployment.call(
          practice: current_practice,
          staff_member: staff_member,
          display_name: staff_member ? nil : required_string!(input[:display_name], field: :display_name, maximum: 120),
          job_title: staff_member ? nil : required_string!(input[:job_title], field: :job_title, maximum: 120),
          membership: current_practice.memberships.active.find(integer_id!(input[:membership_id], field: :membership_id)),
          role_version: workforce_role_version(input[:role_version_id]),
          site_ids: input[:site_ids],
          effective_from: time_param!(input[:effective_from], field: :effective_from),
          actor: current_user
        )
        render json: { schema_version: 1, employment: EmploymentSerializer.call(employment) }, status: :created
      end

      def update
        input = parameter_hash!(:employment, %i[status effective_until role_version_id account_action expected_access_revision], arrays: %i[site_ids])
        employment = Employment.where(practice_id: current_practice.id).find(integer_id!(params[:id], field: :id))
        role_version = input[:role_version_id].present? ? employee_role_version(input[:role_version_id]) : nil
        account_action = input[:account_action].present? ?
          enum_param!(input[:account_action], field: :account_action, allowed: %w[revoke restore]) : nil
        status = input[:status].present? ? enum_param!(input[:status], field: :status, allowed: %w[active inactive]) : nil
        effective_until = if input.key?(:effective_until)
          input[:effective_until].present? ? time_param!(input[:effective_until], field: :effective_until) : nil
        else
          :unchanged
        end
        if account_action == "revoke"
          employment = EmployeeAccessLifecycle.revoke!(employment: employment, actor: current_user)
        elsif account_action == "restore"
          site_ids = input.key?(:site_ids) ? input[:site_ids] : employment.employment_sites.active.pluck(:site_id)
          sites = current_practice.sites.where(id: LinkEmployment.normalize_site_ids(site_ids), status: "active").to_a
          employment = EmployeeAccessLifecycle.restore!(employment: employment, actor: current_user,
            role_version: role_version, sites: sites)
        else
          expected_access_revision = required_string!(input[:expected_access_revision], field: :expected_access_revision, maximum: 64)
          employment = LinkEmployment.update!(employment: employment, actor: current_user, status: status,
            site_ids: input.key?(:site_ids) ? input[:site_ids] : nil, role_version: role_version,
            effective_until: effective_until, expected_access_revision: expected_access_revision)
        end
        render json: { schema_version: 1, employment: EmploymentSerializer.call(employment) }
      end

      private

      def latest_workforce_role_versions
        (Clinic::Authorization::PilotRoleCatalog.current_versions +
          RoleVersion.includes(:permissions).where("role_code LIKE ?", "workforce-%")
            .order(:role_code, version: :desc, id: :desc).to_a).uniq(&:role_code)
      end

      def employee_role_version(value)
        if value.present?
          role_version = RoleVersion.includes(:permissions).find(integer_id!(value, field: :role_version_id))
          return role_version if RoleAssignment.catalogued_role?(role_version)
        else
          role_version = latest_workforce_role_versions.find { |role| role.role_code == "workforce-employee" }
          return role_version if role_version
        end

        raise ArgumentError, "Choose an employee access role."
      end

      alias_method :workforce_role_version, :employee_role_version
    end
  end
end
