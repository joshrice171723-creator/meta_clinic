module Clinic
  module Workforce
    module EmploymentSerializer
      def self.call(employment)
        role_grants = active_role_grants(employment)
        assignments = employment_sites(employment)
        {
          id: employment.id,
          access_revision: EmploymentAccessRevision.call(employment),
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
          roles: role_grants
            .select { |grant| grant.source_employment_id == employment.id }
            .map { |grant| {
              role_version_id: grant.role_version_id,
              role_code: grant.role_version.role_code,
              label: Clinic::Authorization::PilotRoleCatalog.definition(grant.role_version.role_code)&.fetch(:label, nil) ||
                grant.role_version.role_code.titleize,
              scope_kind: grant.scope_kind,
              site_id: grant.site_id
            } },
          sites: assignments.map do |assignment|
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

      def self.active_role_grants(employment)
        membership = employment.membership
        return membership.role_grants.active.includes(:role_version).to_a unless membership.association(:role_grants).loaded?

        at = Time.current
        membership.role_grants.select do |grant|
          grant.effective_from <= at && (grant.effective_until.nil? || grant.effective_until > at) && grant.revoked_at.nil?
        end
      end
      private_class_method :active_role_grants

      def self.employment_sites(employment)
        return employment.employment_sites.sort_by(&:site_id) if employment.association(:employment_sites).loaded?

        employment.employment_sites.includes(:site).order(:site_id).to_a
      end
      private_class_method :employment_sites
    end
  end
end
