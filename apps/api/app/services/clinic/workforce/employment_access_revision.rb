require "digest"
require "json"
require "time"

module Clinic
  module Workforce
    module EmploymentAccessRevision
      # A comparison value, not an authorization credential. Existing records
      # supply provenance; no new counter, schema or access authority is added.
      def self.call(employment, role_grants: nil, employment_sites: nil)
        membership = employment.membership
        fields = [
          employment.id, employment.practice_id, employment.staff_member_id, employment.membership_id,
          employment.status, employment.effective_from.iso8601(6), employment.effective_until&.iso8601(6),
          membership.authorization_generation, membership.active, membership.user.active,
          membership.user.updated_at.iso8601(6), employment.staff_member.updated_at.iso8601(6),
          employment.active_for_work?,
          role_grants ? role_grants.sort_by(&:id).map { |grant|
            [ grant.id, grant.revision, grant.role_version_id, grant.scope_kind, grant.site_id ]
          } : membership.role_grants.active.order(:id).pluck(:id, :revision, :role_version_id, :scope_kind, :site_id),
          (employment_sites ? employment_sites.sort_by(&:id).map { |assignment|
            [ assignment.id, assignment.site_id, assignment.active, assignment.effective_from, assignment.effective_until ]
          } : employment.employment_sites.order(:id).pluck(:id, :site_id, :active, :effective_from, :effective_until))
            .map { |row| row.map { |value| value.respond_to?(:iso8601) ? value.iso8601(6) : value } },
          employment_sites ? employment_sites.select { |assignment|
            assignment.active && assignment.effective_from <= Current.business_time &&
              (assignment.effective_until.nil? || assignment.effective_until > Current.business_time)
          }.map(&:site_id).sort : employment.employment_sites.active.effective_at(Current.business_time).order(:site_id).pluck(:site_id)
        ]
        Digest::SHA256.hexdigest(JSON.generate(fields))
      end
    end
  end
end
