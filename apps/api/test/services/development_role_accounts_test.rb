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
