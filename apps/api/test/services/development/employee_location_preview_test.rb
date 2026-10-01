require "test_helper"

class EmployeeLocationPreviewTest < ActiveSupport::TestCase
  setup do
    @practice = Clinic::Practice.create!(name: "Synthetic Preview Clinic")
    @eligible = @practice.sites.create!(code: "VERF", name: "Synthetic eligible", status: "active")
    @ineligible = @practice.sites.create!(code: "MAIN", name: "Synthetic ineligible", status: "active")
    @user = User.create!(email_address: "preview-employee@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @user)
  end

  test "site scoped employee preview excludes ungranted sites without changing access" do
    grant_permissions!(@membership, "patients.read", scope_kind: "site", site: @eligible)
    generation = @membership.authorization_generation
    assert_no_difference "Clinic::RoleGrant.count" do
      assert_equal [ @eligible.id ], preview_ids
    end
    assert_equal generation, @membership.reload.authorization_generation
    assert_equal [ @eligible.id ], Ability.new(@user, practice: @practice).accessible_site_ids
  end

  test "no grants and expired or future grants do not make sites eligible" do
    assert_empty preview_ids
    grant_permissions!(@membership, "patients.read", scope_kind: "site", site: @eligible,
      effective_from: 2.hours.ago, effective_until: 1.hour.ago)
    grant_permissions!(@membership, "patients.read", scope_kind: "site", site: @ineligible,
      effective_from: 1.hour.from_now)
    assert_empty preview_ids
  end

  test "existing practice wide location permissions still include every practice site" do
    %w[facilities.read appointments.book facilities.write workforce.settings].each do |permission|
      revoke_all_permissions!(@membership)
      grant_permissions!(@membership, permission)
      assert_equal [ @eligible.id, @ineligible.id ].sort, preview_ids.sort, permission
    end
  end

  test "workforce assignments include only active effective locations" do
    staff = @practice.staff_members.create!(display_name: "Synthetic preview staff", job_title: "Synthetic coordinator", active: true)
    employment = Clinic::Workforce::Employment.create!(practice: @practice, staff_member: staff,
      membership: @membership, effective_from: 1.day.ago)
    employment.employment_sites.create!(practice: @practice, site: @eligible, effective_from: 1.hour.ago)
    employment.employment_sites.create!(practice: @practice, site: @ineligible,
      effective_from: 2.hours.ago, effective_until: 1.hour.ago)
    future = @practice.sites.create!(code: "FUTURE", status: "active")
    employment.employment_sites.create!(practice: @practice, site: future, effective_from: 1.hour.from_now)
    assert_equal [ @eligible.id ], preview_ids
    employment.update!(status: "inactive")
    assert_empty preview_ids
  end

  test "Omni preview retains its independently permitted locations" do
    omni = User.create!(email_address: "omni@test.com", admin: true, password: SecureRandom.hex(20))
    membership = @practice.memberships.create!(user: omni)
    role = RoleVersion.create!(role_code: "development-omni-administrator", version: 1)
    membership.role_grants.create!(practice: @practice, role_version: role, scope_kind: "practice",
      effective_from: 1.minute.ago, revision: 1)
    preview = Development::TestAccounts.preview_account_for(omni, profile: "omni")
    assert_equal [ @eligible.id, @ineligible.id ].sort, preview.fetch(:locations).pluck(:id).sort
  end

  test "location preview still requires permitted development access" do
    with_method_result(Rails, :env, ActiveSupport::StringInquirer.new("production")) do
      with_method_result(DevelopmentAccess, :enabled?, false) do
        assert_raises(Development::TestAccounts::Unavailable) { preview_ids }
      end
    end
  end

  private

  def with_method_result(target, method_name, result)
    original = target.method(method_name)
    target.singleton_class.define_method(method_name) { result }
    yield
  ensure
    target.singleton_class.define_method(method_name, original) if original
  end

  def preview_ids
    Development::TestAccounts.preview_account_for(@user, profile: "employee-#{@user.id}")
      .fetch(:locations).pluck(:id)
  end
end
