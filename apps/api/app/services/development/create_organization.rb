module Development
  class CreateOrganization
    def self.call(organization_name:, clinic_name:, location_name:, actor:)
      raise ActiveRecord::RecordNotFound unless DevelopmentAccess.enabled?
      raise ArgumentError, "Choose Omni to create an organization." unless TestAccounts.omni?(actor)

      names = [ organization_name, clinic_name, location_name ].map { |name| name.to_s.strip }
      unless names.all? { |name| name.present? && name.length <= 120 }
        raise ArgumentError, "Enter an organization, clinic, and location name, each 120 characters or fewer."
      end

      Organization.transaction do
        # Serialize repeat submissions so a lost response cannot create a second workspace.
        Organization.connection.execute("SELECT pg_advisory_xact_lock(20260924, 401)")
        organization = Organization.where("lower(name) = ?", names[0].downcase).first
        if organization
          practice = organization.practices.find_by(name: names[1])
          site = practice&.sites&.find_by(name: names[2])
          raise ArgumentError, "That organization already exists. Select it or use a different name." unless site
          return [ practice, site ]
        end

        organization = Organization.create!(name: names[0])
        practice = organization.practices.create!(name: names[1], timezone: "America/Chicago", platform_managed: true)
        site = practice.sites.create!(code: "MAIN", name: names[2], status: "active")
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "development.organization.create",
          outcome: :committed, resource_version_ref: "organization:#{organization.id}:site:#{site.id}")
        [ practice, site ]
      end
    end
  end
end
