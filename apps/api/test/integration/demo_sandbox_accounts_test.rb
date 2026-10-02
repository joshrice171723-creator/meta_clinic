require "test_helper"

class DemoSandboxAccountsTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment, @previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1", "X-Clinic-Demo" => "1" }
    @owner, @other = open_session, open_session
    [ @owner, @other ].each { |browser| browser.host! "localhost:3000" }
    register(@owner, "owner")
    visitor = Development::DemoVisitor.order(:id).last
    register(@other, "other")

    # Small real authorization fixture in the isolated test DB. No full seed or reset.
    @practice = Clinic::Practice.create!(name: "Synthetic account clinic", timezone: "UTC")
    @site = @practice.sites.create!(code: "ACCOUNT-PRIMARY", status: "active")
    @foreign_practice = Clinic::Practice.create!(name: "Synthetic foreign clinic", timezone: "UTC")
    @foreign_site = @foreign_practice.sites.create!(code: "ACCOUNT-FOREIGN", status: "active")
    @users, @memberships = {}, {}
    @users["admin"] = synthetic_user("guided-lesson-sandbox-visitor-#{visitor.id}@example.test")
    admin = @practice.memberships.create!(user: @users.fetch("admin"))
    @memberships["admin"] = admin
    grant_permissions!(admin, "patients.read", "patients.write", "notes.sign", "inventory.read", "roles.manage")
    Clinic::Authorization::PilotRoleCatalog.install!
    { "front_desk" => "front-desk-coordinator", "clinician" => "clinician", "inventory" => "inventory-coordinator" }.each_with_index do |(key, code), index|
      @users[key] = synthetic_user("sandbox-staff-#{@practice.id}-0-#{index + 1}@example.test")
      membership = @practice.memberships.create!(user: @users.fetch(key))
      @memberships[key] = membership
      role = RoleVersion.find_by!(role_code: code, version: Clinic::Authorization::PilotRoleCatalog::VERSION)
      membership.role_grants.create!(practice: @practice, role_version: role, scope_kind: "site", site: @site,
        effective_from: 1.minute.ago, revision: 1)
      # Match the existing seed's separate practice-scope permissions.
      Development::DemoSandboxPopulation.send(:prepare_practice_role!, code)
      practice_role = RoleVersion.find_by(role_code: "#{code}-clinic-access", version: role.version)
      if practice_role
        membership.role_grants.create!(practice: @practice, role_version: practice_role, scope_kind: "practice",
          effective_from: 1.minute.ago, revision: 1)
      end
    end
    @users["patient"] = synthetic_user("sandbox-member-#{@practice.id}-1@example.test")
    @patient = @practice.patients.create!(display_name: "Synthetic sandbox member", reference: "SBX-ACCOUNT-001")
    @foreign_patient = @foreign_practice.patients.create!(display_name: "Synthetic foreign member", reference: "SBX-FOREIGN-001")
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient,
      user: @users.fetch("patient"), status: "active", invited_at: Time.current, activated_at: Time.current,
      accepted_terms_at: Time.current, accepted_terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION)
    Development::DemoLesson.create!(lesson_key: "sandbox", practice: @practice,
      operator_user: @users.fetch("admin"), visitor:)
    @run = Development::DemoRun.create!(template_key: "primary_care", lesson_key: "sandbox",
      practice: @practice, operator_user: @users.fetch("admin"), visitor:,
      baseline: { "sandbox_preparation_step" => Development::SharedDemoLesson::SANDBOX_PREPARERS.length })
  end

  teardown do
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = @previous_environment, @previous_flag
  end

  test "picker entry stays logged out and all five choices establish distinct real actors without grants" do
    users = User.count
    grants = Clinic::RoleGrant.count
    bind(@owner, "front_desk")
    assert_equal true, @owner.response.parsed_body.dig("run", "account_pending")
    assert_nil @owner.response.parsed_body.dig("run", "account")
    assert_empty MemberSession.where(user: @users.values)
    @owner.get "/api/clinic/context", headers: @headers
    assert_equal 401, @owner.response.status
    previous = nil
    @users.each do |key, user|
      choose(@owner, key, expected_user: previous)
      assert_equal 200, @owner.response.status, @owner.response.body
      account = @owner.response.parsed_body.dig("run", "account")
      assert_equal key, account.fetch("key")
      assert_equal user.id, account.fetch("user_id")
      assert_equal @practice.id, account.fetch("practice_id")
      assert_equal(key == "patient" ? "patient" : "clinic", account.fetch("portal"))
      key == "patient" ? assert_nil(account.fetch("site_id")) : assert_equal(@site.id, account.fetch("site_id"))
      assert_equal 1, MemberSession.where(user: @users.values).count
      previous = user.id
    end
    assert_equal 5, @users.values.map(&:id).uniq.length
    assert_equal users, User.count
    assert_equal grants, Clinic::RoleGrant.count
  end

  test "role projections retain ordinary permissions and inventory cannot administer sites" do
    expected = {
      "front_desk" => { "patients_write" => true, "notes_sign" => false, "inventory" => false, "roles" => false },
      "clinician" => { "patients_write" => true, "notes_sign" => true, "inventory" => false, "roles" => false },
      "inventory" => { "patients_write" => false, "notes_sign" => false, "inventory" => true, "roles" => false }
    }
    bind(@owner)
    previous = nil
    expected.each do |key, capabilities|
      choose(@owner, key, expected_user: previous)
      assert_equal 200, @owner.response.status
      @owner.get "/api/clinic/context", headers: @headers
      assert_equal 200, @owner.response.status, @owner.response.body
      body = @owner.response.parsed_body
      assert_equal @users.fetch(key).id, body.fetch("user_id")
      assert_equal @practice.id, body.dig("practice", "id")
      capabilities.each { |capability, value| assert_equal value, body.dig("capabilities", capability), capability }
      previous = @users.fetch(key).id
    end
    sites = Clinic::Site.count
    @owner.post "/api/clinic/facilities", params: { site: { code: "DENIED-ACCOUNT-SITE" } },
      headers: csrf_headers(@owner), as: :json
    assert_equal 403, @owner.response.status
    assert_equal sites, Clinic::Site.count
    @owner.get "/api/clinic/context", headers: @headers
    assert_equal 200, @owner.response.status
  end

  test "patient receives only its assigned record and cannot use clinic or Omni selection" do
    bind(@owner, "patient")
    choose(@owner, "patient")
    assert_equal 200, @owner.response.status
    @owner.get "/api/patient_portal/context", params: { patient_id: @foreign_patient.id }, headers: @headers
    assert_equal 200, @owner.response.status
    assert_equal @patient.id, @owner.response.parsed_body.dig("patient", "id")
    assert_equal @practice.id, @owner.response.parsed_body.dig("practice", "id")
    refute @owner.response.parsed_body.key?("development_preview")
    @owner.patch "/api/patient_portal/development_patient", params: { patient_id: @foreign_patient.id },
      headers: csrf_headers(@owner), as: :json
    assert_equal 404, @owner.response.status
    @owner.get "/api/clinic/context", headers: @headers
    assert_equal 403, @owner.response.status
  end

  test "invalid foreign or stale account inputs preserve the current actor and session" do
    enter_admin
    before = MemberSession.order(:id).pluck(:id, :user_id)
    [ { account: "platform_owner" }, { account: "front_desk", expected_user_id: @users.fetch("patient").id },
      { account: "front_desk", expected_run_id: @run.id + 999 },
      { account: "front_desk", user_id: @users.fetch("patient").id },
      { account: "front_desk", practice_id: @foreign_practice.id } ].each do |input|
      choose(@owner, "front_desk", expected_user: @users.fetch("admin").id, **input)
      assert_equal(input.key?(:user_id) || input.key?(:practice_id) ? 400 : 422, @owner.response.status)
      assert_equal before, MemberSession.order(:id).pluck(:id, :user_id)
    end
    @owner.patch "/api/clinic/context", params: { practice_id: @foreign_practice.id }, headers: csrf_headers(@owner), as: :json
    assert_equal 404, @owner.response.status
    @owner.get "/api/clinic/context", headers: @headers
    assert_equal @practice.id, @owner.response.parsed_body.dig("practice", "id")
  end

  test "a role on a different site or foreign practice is not selectable" do
    enter_admin
    target = @memberships.fetch("front_desk")
    second_site = @practice.sites.create!(code: "ACCOUNT-SECOND", status: "active")
    original = target.role_grants.where(scope_kind: "site").first!
    original.update!(revoked_at: Time.current, revision: 2)
    target.role_grants.create!(practice: @practice, role_version: original.role_version,
      scope_kind: "site", site: second_site, effective_from: 1.minute.ago, revision: 1)
    choose(@owner, "front_desk", expected_user: @users.fetch("admin").id)
    assert_equal 404, @owner.response.status
    target.update!(active: false)
    foreign = @foreign_practice.memberships.create!(user: target.user)
    foreign.role_grants.create!(practice: @foreign_practice, role_version: original.role_version,
      scope_kind: "site", site: @foreign_site, effective_from: 1.minute.ago, revision: 1)
    choose(@owner, "front_desk", expected_user: @users.fetch("admin").id)
    assert_equal 404, @owner.response.status
    @owner.get "/api/clinic/context", headers: @headers
    assert_equal 200, @owner.response.status
    assert_equal @users.fetch("admin").id, @owner.response.parsed_body.fetch("user_id")
  end

  test "inactive members and revoked role grants cannot be selected" do
    enter_admin
    @memberships.fetch("front_desk").update!(active: false)
    choose(@owner, "front_desk", expected_user: @users.fetch("admin").id)
    assert_equal 404, @owner.response.status
    revoke_all_permissions!(@memberships.fetch("inventory"))
    choose(@owner, "inventory", expected_user: @users.fetch("admin").id)
    assert_equal 404, @owner.response.status
    @users.fetch("clinician").update!(active: false)
    choose(@owner, "clinician", expected_user: @users.fetch("admin").id)
    assert_equal 404, @owner.response.status
    @owner.get "/api/demo/run", headers: @headers
    assert_equal "admin", @owner.response.parsed_body.dig("run", "account", "key")
  end

  test "revocation after login denies reads and further account switching" do
    bind(@owner, "inventory")
    choose(@owner, "inventory")
    assert_equal 200, @owner.response.status
    revoke_all_permissions!(@memberships.fetch("inventory"))
    @owner.get "/api/clinic/context", headers: @headers
    assert_equal 401, @owner.response.status
    choose(@owner, "admin", expected_user: @users.fetch("inventory").id)
    assert_equal 404, @owner.response.status
  end

  test "revoked patient identity cannot be selected or continue reading" do
    bind(@owner, "patient")
    choose(@owner, "patient")
    assert_equal 200, @owner.response.status
    @identity.update!(status: "revoked", revoked_at: Time.current)
    @owner.get "/api/patient_portal/context", headers: @headers
    assert_equal 401, @owner.response.status
    bind(@other)
    choose(@other, "patient")
    assert_equal 404, @other.response.status
  end

  test "switching and leaving one browser preserve the other browser on the same shared actor" do
    [ @owner, @other ].each { |browser| bind(browser); choose(browser, "admin"); assert_equal 200, browser.response.status }
    sessions = @users.fetch("admin").member_sessions.order(:id).pluck(:id)
    assert_equal 2, sessions.length
    choose(@owner, "front_desk", expected_user: @users.fetch("admin").id)
    assert_equal 200, @owner.response.status
    assert_equal [ sessions.last ], @users.fetch("admin").member_sessions.pluck(:id)
    @other.get "/api/demo/run", headers: @headers
    assert_equal "admin", @other.response.parsed_body.dig("run", "account", "key")
    @other.get "/api/clinic/context", headers: @headers
    assert_equal 200, @other.response.status
    assert_equal @users.fetch("admin").id, @other.response.parsed_body.fetch("user_id")
    @owner.post "/api/demo/run/reset", params: {}, headers: csrf_headers(@owner), as: :json
    assert_equal 200, @owner.response.status
    assert @run.reload.active?
    assert_equal [ sessions.last ], @users.fetch("admin").member_sessions.pluck(:id)
    assert_empty @users.fetch("front_desk").member_sessions
    @other.get "/api/clinic/context", headers: @headers
    assert_equal 200, @other.response.status
  end

  test "a stale browser cookie cannot replay the replaced session" do
    enter_admin
    stale = open_session
    stale.host! "localhost:3000"
    @owner.cookies.to_hash.each { |name, value| stale.cookies[name] = value }
    stale_headers = csrf_headers(stale)
    choose(@owner, "front_desk", expected_user: @users.fetch("admin").id)
    assert_equal 200, @owner.response.status
    sessions = MemberSession.order(:id).pluck(:id, :user_id)
    stale.post "/api/demo/run/view", params: { account: "inventory", expected_run_id: @run.id,
      expected_user_id: @users.fetch("admin").id }, headers: stale_headers, as: :json
    assert_equal 404, stale.response.status
    assert_equal sessions, MemberSession.order(:id).pluck(:id, :user_id)
    stale.post "/api/demo/run/resume", params: {}, headers: stale_headers, as: :json
    assert_equal 404, stale.response.status
    assert_equal sessions, MemberSession.order(:id).pluck(:id, :user_id)
    @owner.get "/api/demo/run", headers: @headers
    assert_equal "front_desk", @owner.response.parsed_body.dig("run", "account", "key")
  end

  test "a request cached before another rotation is rejected by the shared view and resume lock guard" do
    enter_admin
    cached = @users.fetch("admin").member_sessions.first!
    controller = Development::DemoRunsController.new
    controller.define_singleton_method(:current_member_session) { cached }
    choose(@owner, "front_desk", expected_user: @users.fetch("admin").id)
    assert_equal 200, @owner.response.status
    sessions = MemberSession.order(:id).pluck(:id, :user_id)
    assert_raises(ActiveRecord::RecordNotFound) do
      controller.send(:with_current_sandbox_run!, @run) { flunk "A stale cached session must not establish a replacement" }
    end
    assert_equal sessions, MemberSession.order(:id).pluck(:id, :user_id)
  end

  test "reset rejects missing backup proof and an actual non-demo database even with hosted flags" do
    names = %w[SANDBOX_RESET_BACKUP_VERIFIED APP_DEPLOYMENT_ENV APP_GUIDED_DEMO PGDATABASE]
    previous = names.to_h { |name| [ name, ENV[name] ] }
    sessions = MemberSession.count
    baseline = @run.attributes
    ENV.delete("SANDBOX_RESET_BACKUP_VERIFIED")
    error = assert_raises(RuntimeError) { Development::SandboxReset.run! }
    assert_equal "Verified backup required", error.message
    Rails.env = "production"
    ENV["APP_DEPLOYMENT_ENV"], ENV["APP_GUIDED_DEMO"], ENV["PGDATABASE"] = "staging", "1", "apply_guided_demo"
    error = assert_raises(RuntimeError) { Development::SandboxReset.check! }
    assert_equal "Hosted demo database required", error.message
    assert_equal baseline, @run.reload.attributes
    assert_equal sessions, MemberSession.count
  ensure
    previous&.each { |name, value| ENV[name] = value }
    Rails.env = "development"
  end

  test "reset authority snapshot recognizes revoked grants instead of treating actor IDs as sufficient" do
    before = Development::SandboxReset.send(:authorization_snapshot, [ @practice.id ])
    revoke_all_permissions!(@memberships.fetch("front_desk"))
    after = Development::SandboxReset.send(:authorization_snapshot, [ @practice.id ])
    refute_equal before, after
    assert_equal before.map { |row| row[0..3] }, after.map { |row| row[0..3] }
  end

  test "reset refuses expiring grants before seed work and preserves the original constraints" do
    grant = @memberships.fetch("front_desk").role_grants.where(scope_kind: "site").first!
    grant.update!(effective_until: 1.day.from_now, revision: 2)
    before = grant.attributes
    run = @run.attributes
    error = assert_raises(RuntimeError) do
      Development::SandboxReset.send(:assert_untimed_authority!, [ @practice.id ])
    end
    assert_equal "Sandbox reset cannot preserve timed role grants", error.message
    assert_equal before, grant.reload.attributes
    assert_equal run, @run.reload.attributes
    snapshot = Development::SandboxReset.send(:authorization_snapshot, [ @practice.id ])
    grant.update!(effective_until: 2.days.from_now, revision: 3)
    refute_equal snapshot, Development::SandboxReset.send(:authorization_snapshot, [ @practice.id ])
  end

  test "reset refuses future grants while accepting the existing untimed pool" do
    assert_nil Development::SandboxReset.send(:assert_untimed_authority!, [ @practice.id ])
    grant = @memberships.fetch("inventory").role_grants.where(scope_kind: "site").first!
    grant.update!(effective_from: 1.day.from_now, revision: 2)
    before = grant.attributes
    assert_raises(RuntimeError) do
      Development::SandboxReset.send(:assert_untimed_authority!, [ @practice.id ])
    end
    assert_equal before, grant.reload.attributes
    grant.update!(revoked_at: Time.current, revision: 3)
    assert_nil Development::SandboxReset.send(:assert_untimed_authority!, [ @practice.id ])
  end

  test "incomplete preparation and inactive runs cannot establish role sessions" do
    @run.update!(baseline: {})
    bind(@owner)
    choose(@owner, "admin")
    assert_equal 404, @owner.response.status
    assert_empty MemberSession.where(user: @users.values)
    @run.update!(active: false)
    choose(@owner, "admin")
    assert_equal 404, @owner.response.status
  end

  private

  def synthetic_user(email)
    User.create!(email_address: email, password: SecureRandom.hex(20), active: true, admin: false)
  end

  def csrf_headers(browser)
    browser.get "/api/csrf", headers: @headers
    assert_equal 200, browser.response.status
    @headers.merge("X-CSRF-Token" => browser.response.parsed_body.fetch("csrf_token"))
  end

  def register(browser, label)
    browser.post "/api/demo/visitor", params: { name: "Synthetic #{label}",
      email: "#{label}-#{SecureRandom.hex(6)}@example.test", company: "Synthetic Clinic" },
      headers: csrf_headers(browser), as: :json
    assert_equal 200, browser.response.status
  end

  def bind(browser, key = "admin")
    browser.post "/api/demo/lesson", params: { lesson_key: "sandbox", account: key },
      headers: csrf_headers(browser), as: :json
    assert_equal 201, browser.response.status, browser.response.body
  end

  def choose(browser, key, expected_user: nil, **overrides)
    browser.post "/api/demo/run/view", params: { account: key, expected_run_id: @run.id,
      expected_user_id: expected_user }.merge(overrides), headers: csrf_headers(browser), as: :json
  end

  def enter_admin
    bind(@owner)
    choose(@owner, "admin")
    assert_equal 200, @owner.response.status, @owner.response.body
  end
end
