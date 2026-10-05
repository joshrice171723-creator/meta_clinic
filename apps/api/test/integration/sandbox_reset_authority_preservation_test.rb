require "test_helper"
require "digest"

class SandboxResetAuthorityPreservationTest < ActiveSupport::TestCase
  setup do
    @previous_flag = ENV["SANDBOX_RESET_BACKUP_VERIFIED"]
    ENV["SANDBOX_RESET_BACKUP_VERIFIED"] = "1"
  end

  teardown do
    ENV["SANDBOX_RESET_BACKUP_VERIFIED"] = @previous_flag
  end

  test "guarded repeated resets retain old roles exact scopes identities and credentials and roll back authority drift" do
    visitor = Development::DemoVisitor.create!(name: "Synthetic preservation visitor",
      email: "preservation-#{SecureRandom.hex(6)}@example.test", company: "Synthetic Clinic")
    run = Development::SharedDemoLesson.enter!("sandbox", visitor:)
    Clinic::Authorization::PilotRoleCatalog.install!
    Development::DemoSandboxPopulation.send(:prepare_practice_role!, "front-desk-coordinator")
    old_roles = %w[front-desk-coordinator front-desk-coordinator-clinic-access].to_h do |code|
      current = RoleVersion.find_by!(role_code: code, version: Clinic::Authorization::PilotRoleCatalog::VERSION)
      old = RoleVersion.create!(role_code: code, version: 12)
      current.permissions.where.not(action_code: "reminders.read").each do |permission|
        RoleVersionPermission.create!(role_version: old, permission:)
      end
      [ code, old ]
    end
    find_role = RoleVersion.method(:find_by!)
    practice_role = Development::DemoSandboxPopulation.method(:practice_role_for)
    # Model a sandbox provisioned before catalog v13. New provisioning still uses
    # the current catalog; only this fixture redirects the front desk recipes.
    with_stub(RoleVersion, :find_by!, ->(**attributes) {
      old_roles[attributes[:role_code]] || find_role.call(**attributes)
    }) do
      with_stub(Development::DemoSandboxPopulation, :practice_role_for, ->(code) {
        old_roles["#{code}-clinic-access"] || practice_role.call(code)
      }) do
        Development::SharedDemoLesson.prepare_sandbox_step!(run, visitor:)
      end
    end
    (Development::SharedDemoLesson::SANDBOX_PREPARERS.length - 1).times do
      Development::SharedDemoLesson.prepare_sandbox_step!(run, visitor:)
    end
    practice_ids = run.practice.organization.practice_ids
    membership = run.practice.memberships.joins(:user)
      .find_by!(users: { email_address: "sandbox-staff-#{run.practice_id}-1-7@example.test" })
    sites = run.practice.sites.order(:id).to_a
    # A second-site grant and a revoked grant must not be replaced by defaults.
    membership.role_grants.create!(practice_id: run.practice_id,
      role_version: old_roles.fetch("front-desk-coordinator"), scope_kind: "site", site: sites.last,
      effective_from: 2.days.ago, revision: 4)
    membership.role_grants.create!(practice_id: run.practice_id,
      role_version: old_roles.fetch("front-desk-coordinator"), scope_kind: "site", site: sites.first,
      effective_from: 3.days.ago, revoked_at: 1.day.ago, revision: 2)
    identity = user_snapshot
    authority = Development::SandboxReset.send(:authorization_snapshot, practice_ids)
    grants = normalized_grants(practice_ids)
    accounts = account_ids(run)
    old_site_ids = Clinic::Site.where(practice_id: practice_ids).pluck(:id)

    # Keep the real transaction, seed stages and all post-reset guards; replace
    # only the hosted database preflight for this uniquely isolated test DB.
    with_stub(Development::SandboxReset, :check!, -> { account_ids(Development::DemoRun.active.find_by!(lesson_key: "sandbox")) }) do
      2.times do
        result = Development::SandboxReset.run!
        run = Development::DemoRun.find(result.fetch(:run_id))
        assert_equal Development::SharedDemoLesson::SANDBOX_PREPARERS.length, result.fetch(:stages)
        assert_equal accounts, account_ids(run)
        assert_equal identity, user_snapshot
        assert_equal authority, Development::SandboxReset.send(:authorization_snapshot, practice_ids)
        assert_equal grants, normalized_grants(practice_ids)
        refute Clinic::RoleGrant.where(membership:).active.joins(role_version: :permissions)
          .exists?(permissions: { action_code: "reminders.read" })
      end
      assert_empty old_site_ids & Clinic::Site.where(practice_id: practice_ids).pluck(:id)
      before = database_rows
      restore = Development::SandboxRoleGrants.method(:restore!)
      with_stub(Development::SandboxRoleGrants, :restore!, ->(snapshot) {
        restore.call(snapshot)
        actor = Clinic::Membership.find(membership.id)
        actor.role_grants.create!(practice_id: actor.practice_id,
          role_version: RoleVersion.find_by!(role_code: "front-desk-coordinator",
            version: Clinic::Authorization::PilotRoleCatalog::VERSION),
          scope_kind: "site", site: actor.practice.sites.first!, effective_from: Time.current, revision: 1)
      }) do
        error = assert_raises(RuntimeError) { Development::SandboxReset.run! }
        assert_equal "Sandbox reset changed effective authority", error.message
      end
      assert_equal before, database_rows, "Authority failure must roll back all persisted rows"
      with_stub(Development::SandboxRoleGrants, :restore!, ->(snapshot) {
        invalid = snapshot.deep_dup
        invalid.last["site_code"] = "MISSING-SITE"
        restore.call(invalid)
      }) do
        assert_raises(ActiveRecord::RecordNotFound) { Development::SandboxReset.run! }
      end
      assert_equal before, database_rows, "Missing mappings must roll back rather than use the current catalog"
      with_stub(Development::SharedDemoLesson, :enter!, ->(*) {
        membership.user.update!(password: SecureRandom.hex(20))
        run
      }) do
        with_stub(Development::SharedDemoLesson, :prepare_sandbox_step!, true) do
          error = assert_raises(RuntimeError) { Development::SandboxReset.run! }
          assert_equal "Sandbox reset changed credentials", error.message
        end
      end
      assert_equal before, database_rows, "Credential failure must roll back the password write"
    end
  end

  test "preserved staff with no grants cannot acquire default catalog authority or a new identity" do
    practice = Clinic::Practice.create!(name: "Synthetic empty grants", timezone: "UTC")
    site = practice.sites.create!(code: "EMPTY", status: "active")
    practice.departments.create!(code: "TEST")
    Development::DemoSandboxPopulation::STAFF_TITLES.each_index do |index|
      user = User.create!(email_address: "sandbox-staff-#{practice.id}-1-#{index + 1}@example.test",
        password: SecureRandom.hex(20), active: true, admin: false)
      practice.memberships.create!(user:)
    end
    Development::DemoSandboxPopulation.send(:prepare_staff!, practice:, site:, site_index: 1,
      as_of: Time.current, preserve_authority: true)
    assert_empty Clinic::RoleGrant.where(practice:)
    assert_raises(RuntimeError) do
      Development::DemoSandboxPopulation.send(:prepare_staff!, practice:, site:, site_index: 2,
        as_of: Time.current, preserve_authority: true)
    end
    assert_equal 12, practice.memberships.count
    assert_raises(RuntimeError) { Development::SandboxRoleGrants.restore!(nil) }
  end

  private

  def with_stub(object, name, replacement)
    original = object.method(name)
    private_method = object.singleton_class.private_method_defined?(name)
    object.define_singleton_method(name) do |*args, **kwargs, &block|
      replacement.respond_to?(:call) ? replacement.call(*args, **kwargs, &block) : replacement
    end
    yield
  ensure
    object.define_singleton_method(name, original)
    object.singleton_class.send(:private, name) if private_method
  end

  def account_ids(run)
    Development::SandboxAccounts::OPTIONS.keys.to_h do |key|
      [ key, Development::SandboxAccounts.resolve(run, key).user.id ]
    end
  end

  def normalized_grants(practice_ids)
    Development::SandboxRoleGrants.capture!(practice_ids).as_json.sort_by(&:to_s)
  end

  def user_snapshot
    Digest::SHA256.hexdigest(Marshal.dump(User.order(:id).pluck(:id, :email_address, :password_digest, :active, :admin)))
  end

  def database_rows
    connection = ApplicationRecord.connection
    connection.tables.sort.to_h do |table|
      rows = connection.exec_query("SELECT * FROM #{connection.quote_table_name(table)}").rows
      [ table, Digest::SHA256.hexdigest(Marshal.dump(rows.sort_by(&:to_s))) ]
    end
  end
end
