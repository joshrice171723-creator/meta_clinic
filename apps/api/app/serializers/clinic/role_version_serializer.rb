module Clinic
  module RoleVersionSerializer
    def self.call(role_version)
      {
        id: role_version.id,
        role_code: role_version.role_code,
        version: role_version.version,
        permissions: role_version.permissions.order(:action_code).pluck(:action_code)
      }
    end
  end
end
