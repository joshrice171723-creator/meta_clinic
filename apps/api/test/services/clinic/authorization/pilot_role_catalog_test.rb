require "test_helper"

class PilotRoleCatalogTest < ActiveSupport::TestCase
  test "install creates a missing current role and is idempotent" do
    catalog = Clinic::Authorization::PilotRoleCatalog
    role = RoleVersion.find_by(role_code: "clinic-administrator", version: catalog::VERSION)
    RoleVersionPermission.where(role_version: role).delete_all if role
    role&.delete

    assert_difference -> { RoleVersion.where(role_code: "clinic-administrator", version: catalog::VERSION).count }, 1 do
      catalog.install!
    end
    installed = RoleVersion.includes(:permissions).find_by!(role_code: "clinic-administrator", version: catalog::VERSION)
    assert_equal catalog.definition("clinic-administrator").fetch(:permissions).sort,
      installed.permissions.map(&:action_code).sort

    assert_no_difference [ "RoleVersion.count", "Permission.count", "RoleVersionPermission.count" ] do
      catalog.install!
    end
  end
end
