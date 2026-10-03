module Clinic
  module Workforce
    class RoleAssignment
      LOCATION_ROLE_CODE = "workforce-location-manager"
      WORKFORCE_ROLE_VERSIONS = {
        "workforce-administrator" => 1,
        LOCATION_ROLE_CODE => 1,
        "workforce-payroll-operator" => 1
      }.freeze

      def self.default_role_version
        RoleVersion.includes(:permissions).where(role_code: "workforce-employee")
          .order(version: :desc, id: :desc).first ||
          raise(ArgumentError, "The employee access role is not configured.")
      end

      def self.assignable?(actor:, practice:, role_version:, ability: nil)
        validate_role!(role_version)
        ability ||= Ability.new(actor, practice: practice)
        ability.allowed_permission?("roles.manage")
      rescue ArgumentError
        false
      end

      def self.catalogued_role?(role_version)
        role_version.is_a?(RoleVersion) &&
          (WORKFORCE_ROLE_VERSIONS[role_version.role_code] == role_version.version ||
            Clinic::Authorization::PilotRoleCatalog.assignable?(role_version))
      end

      def self.grant!(actor:, membership:, role_version:, sites:, effective_from:, source_employment: nil)
        role_version ||= default_role_version
        validate_role!(role_version)
        targets = role_version.role_code == LOCATION_ROLE_CODE ? sites : [ nil ]
        targets.map do |site|
          Clinic::Authorization::GrantAccess.call(
            grantor: actor,
            membership: membership,
            role_version: role_version,
            scope_kind: site ? "site" : "practice",
            site: site,
            source_employment: source_employment,
            effective_from: effective_from,
            workforce_role_assignment: true
          )
        end
      end

      def self.validate_role!(role_version)
        unless catalogued_role?(role_version)
          raise ArgumentError, "Choose an employee access role."
        end
      end
      private_class_method :validate_role!
    end
  end
end
