module Clinic
  module Workforce
    module EmploymentSerializer
      def self.call(employment)
        {
          id: employment.id,
          status: employment.status,
          effective_from: employment.effective_from.iso8601,
          effective_until: employment.effective_until&.iso8601,
          active_for_work: employment.active_for_work?,
          staff_member: {
            id: employment.staff_member.id,
            display_name: employment.staff_member.display_name,
            job_title: employment.staff_member.job_title,
            active: employment.staff_member.active
          },
          membership_summary: {
            id: employment.membership.id,
            email_address: employment.membership.user.email_address,
            active: employment.membership.active && employment.membership.user.active
          },
          roles: employment.membership.role_grants.active.includes(:role_version)
            .select { |grant| grant.role_version.role_code.start_with?("workforce-") }
            .map { |grant| { role_code: grant.role_version.role_code, scope_kind: grant.scope_kind, site_id: grant.site_id } },
          sites: employment.employment_sites.includes(:site).order(:site_id).map do |assignment|
            {
              id: assignment.site.id,
              code: assignment.site.code,
              name: assignment.site.name,
              active: assignment.active && assignment.effective_from <= Current.business_time &&
                (assignment.effective_until.nil? || assignment.effective_until > Current.business_time),
              effective_from: assignment.effective_from.iso8601,
              effective_until: assignment.effective_until&.iso8601
            }
          end
        }
      end
    end
  end
end
