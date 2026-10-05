module Development
  # Preserve the grants DemoClinicReset removes, including revoked grants. Role
  # versions and memberships survive reset; sites and employments must be remapped.
  class SandboxRoleGrants
    ATTRIBUTES = %w[practice_id membership_id role_version_id scope_kind effective_from
      effective_until revoked_at revision].freeze

    def self.capture!(practice_ids)
      Clinic::RoleGrant.where(practice_id: practice_ids)
        .where("site_id IS NOT NULL OR source_employment_id IS NOT NULL")
        .includes(:site, :source_employment).order(:id).map do |grant|
          employment = grant.source_employment
          raise "Cannot map preserved sandbox employment" if employment &&
            employment.membership_id != grant.membership_id

          grant.attributes.slice(*ATTRIBUTES).merge(
            "site_code" => grant.site&.code, "employment_backed" => employment.present?
          )
        end
    end

    def self.restore!(grants)
      raise "Preserved sandbox grants missing" unless grants.is_a?(Array)

      ApplicationRecord.transaction do
        grants.each do |attributes|
          practice = Clinic::Practice.find(attributes.fetch("practice_id"))
          membership = practice.memberships.find(attributes.fetch("membership_id"))
          role = RoleVersion.find(attributes.fetch("role_version_id"))
          site = if (code = attributes.fetch("site_code"))
            practice.sites.find_by!(code:)
          end
          employment = if attributes.fetch("employment_backed")
            # Employment has a unique (practice_id, membership_id) constraint.
            Clinic::Workforce::Employment.find_by!(practice:, membership:)
          end
          membership.role_grants.create!(attributes.slice(*ATTRIBUTES).merge(
            role_version: role, site:, source_employment: employment
          ))
        end
      end
    end
  end
end
