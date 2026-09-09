require "test_helper"

class DevelopmentRoleAccountsTest < ActiveSupport::TestCase
  def local_mode
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    yield
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end

  test "prepares one named least-privilege account for each clinic role" do
    local_mode do
      accounts = Development::RoleAccounts.prepare!

      assert_equal Development::RoleAccounts::ACCOUNTS.keys.sort, accounts.keys.sort
      Development::RoleAccounts::ACCOUNTS.each do |role_code, definition|
        user = accounts.fetch(role_code)
        membership = user.clinic_membership
        assert user.active?
        assert membership.active?
        assert_equal [ role_code ], membership.role_grants.active.joins(:role_version)
          .pluck("role_versions.role_code")
        assert_equal definition.fetch(:label), Development::TestAccounts.send(:role_label, role_code)
        assert_equal definition.fetch(:label), Development::TestAccounts.preview_accounts
          .find { |account| account.fetch(:id) == "employee-#{user.id}" }
          .fetch(:label)
      end
    end
  end

  test "clinic administrator receives operational modules without payroll or scribe access" do
    permissions = Development::RoleAccounts::ACCOUNTS.fetch("clinic-administrator").fetch(:permissions)

    assert_includes permissions, "telehealth.read"
    assert_includes permissions, "workforce.schedule.manage"
    assert_includes permissions, "subscription_catalog.publish"
    assert_includes permissions, "reminders.write"
    assert_not_includes permissions, "workforce.payroll.configure"
    assert_not_includes permissions, "workforce.payroll.export"
    assert_not_includes permissions, "scribe.read"
  end

  test "clinic administrator upgrades granted access through a new role version" do
    local_mode do
      administrator = Development::RoleAccounts.prepare!.fetch("clinic-administrator")
      original_role = administrator.clinic_membership.role_grants.active.sole.role_version
      assert_equal 2, original_role.version

      original_role.role_grants.first.update!(revoked_at: Time.current)
      previous = RoleVersion.create!(role_code: "clinic-administrator", version: 1)
      previous_permission = Permission.find_or_create_by!(action_code: "patients.read")
      RoleVersionPermission.create!(role_version: previous, permission: previous_permission)
      administrator.clinic_membership.role_grants.create!(practice: administrator.clinic_membership.practice,
        role_version: previous, scope_kind: "practice", effective_from: Time.current, revision: 1)

      Development::RoleAccounts.prepare!

      grants = administrator.clinic_membership.role_grants.where(scope_kind: "practice")
      assert grants.find_by!(role_version: previous).revoked_at
      assert_nil grants.find_by!(role_version: original_role).revoked_at
    end
  end

  test "retires anonymous accounts that have one grant for every permission" do
    local_mode do
      user = User.create!(email_address: "demo-#{SecureRandom.uuid}@example.invalid", password: SecureRandom.hex(32))
      membership = Development::TestClinic.create!(user)
      assert membership.active?

      Development::RoleAccounts.prepare!

      assert_not membership.reload.active?
      assert_not user.reload.active?
    end
  end
end
