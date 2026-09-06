module Clinic
  module Workforce
    class RoleAssignment
      WORKFORCE_ROLE_PREFIX = "workforce-"
      LOCATION_ROLE_CODE = "workforce-location-manager"

      def self.default_role_version
        RoleVersion.includes(:permissions).where(role_code: "workforce-employee")
          .order(version: :desc, id: :desc).first ||
          raise(ArgumentError, "The employee access role is not configured.")
      end

      def self.assignable?(actor:, practice:, role_version:)
        validate_role!(role_version)
        ability = Ability.new(actor, practice: practice)
        return false unless ability.allowed_permission?("roles.manage")

        role_version.permissions.all? do |permission|
          ability.allowed_permission?(permission.action_code,
            any_site: role_version.role_code == LOCATION_ROLE_CODE)
        end
      rescue ArgumentError
        false
      end

      def self.grant!(actor:, membership:, role_version:, sites:, effective_from:)
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
            effective_from: effective_from
          )
        end
      end

      def self.validate_role!(role_version)
        unless role_version.is_a?(RoleVersion) && role_version.role_code.start_with?(WORKFORCE_ROLE_PREFIX)
          raise ArgumentError, "Choose a workforce access role."
        end
      end
      private_class_method :validate_role!
    end
  end
end
