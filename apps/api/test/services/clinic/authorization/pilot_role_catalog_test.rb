require "test_helper"

class PilotRoleCatalogTest < ActiveSupport::TestCase
  test "install creates a missing current role and is idempotent" do
    catalog = Clinic::Authorization::PilotRoleCatalog
    catalog.install!
    installed = RoleVersion.includes(:permissions).find_by!(role_code: "clinic-administrator", version: catalog::VERSION)
    assert_equal catalog.definition("clinic-administrator").fetch(:permissions).sort,
      installed.permissions.map(&:action_code).sort

    assert_no_difference [ "RoleVersion.count", "Permission.count", "RoleVersionPermission.count" ] do
      catalog.install!
    end
  end

  test "clinic administration and front desk roles can review memberships" do
    catalog = Clinic::Authorization::PilotRoleCatalog

    %w[clinic-administrator front-desk-coordinator].each do |role_code|
      assert_includes catalog.definition(role_code).fetch(:permissions), "subscriptions.review"
    end
  end
end
