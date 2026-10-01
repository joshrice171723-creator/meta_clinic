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

  test "front desk reminder visibility is read only and leaves version twelve grants unchanged" do
    catalog = Clinic::Authorization::PilotRoleCatalog
    old_role = RoleVersion.find_or_create_by!(role_code: "front-desk-coordinator", version: 12)
    old_permissions = catalog.definition("front-desk-coordinator").fetch(:permissions) - [ "reminders.read" ]
    old_permissions.each do |action_code|
      permission = Permission.find_or_create_by!(action_code:)
      RoleVersionPermission.find_or_create_by!(role_version: old_role, permission:)
    end
    practice = Clinic::Practice.create!(name: "Synthetic front desk access clinic")
    user = User.create!(email_address: "front-desk-reminder-policy@example.invalid", password: SecureRandom.hex(20))
    membership = Clinic::Membership.create!(practice:, user:)
    old_grant = membership.role_grants.create!(practice:, role_version: old_role, scope_kind: "practice",
      effective_from: 1.minute.ago, revision: 1)

    catalog.install!

    assert_equal old_permissions.sort, old_role.reload.permissions.pluck(:action_code).sort
    assert_equal old_role.id, old_grant.reload.role_version_id
    refute Ability.new(user, practice:).allowed_permission?("reminders.read")
    current_role = RoleVersion.find_by!(role_code: "front-desk-coordinator", version: catalog::VERSION)
    membership.role_grants.create!(practice:, role_version: current_role, scope_kind: "practice",
      effective_from: 1.minute.ago, revision: 1)
    ability = Ability.new(user, practice:)
    assert ability.allowed_permission?("reminders.read")
    refute ability.allowed_permission?("reminders.write")
    assert_equal old_role.id, old_grant.reload.role_version_id
    assert_nil old_grant.revoked_at
  end
end
