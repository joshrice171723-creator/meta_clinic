require "test_helper"

class WorkforceAccessTest < ActionDispatch::IntegrationTest
  PASSWORD = "Workforce-access-only-2026!".freeze

  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }

    @practice = Clinic::Practice.create!(name: "Workforce Access Clinic", timezone: "UTC")
    @assigned_site = @practice.sites.create!(code: "MAIN", name: "Main clinic", status: "active")
    @other_site = @practice.sites.create!(code: "NORTH", name: "North clinic", status: "active")

    @employee = create_user("workforce-employee")
    @employee_membership = @practice.memberships.create!(user: @employee)
    @employee_directory = @practice.staff_members.create!(display_name: "Taylor Morgan",
      job_title: "Clinic coordinator", active: true)
    @employment = Clinic::Workforce::Employment.create!(practice: @practice,
      staff_member: @employee_directory, membership: @employee_membership,
      status: "active", effective_from: 1.hour.ago)
    @employment.employment_sites.create!(practice: @practice, site: @assigned_site,
      active: true, effective_from: 1.hour.ago)

    @manager = create_user("workforce-manager")
    @manager_membership = @practice.memberships.create!(user: @manager)
    grant_permissions!(@manager_membership, "roles.manage", "workforce.admin", "workforce.settings",
      "workforce.payroll.configure", "workforce.payroll.export")

    @foreign_practice = Clinic::Practice.create!(name: "Foreign Workforce Clinic", timezone: "UTC")
    @foreign_site = @foreign_practice.sites.create!(code: "FOREIGN", name: "Foreign clinic", status: "active")
    @foreign_user = create_user("foreign-workforce-employee")
    @foreign_membership = @foreign_practice.memberships.create!(user: @foreign_user)
    @foreign_directory = @foreign_practice.staff_members.create!(display_name: "Morgan Lee",
      job_title: "Foreign coordinator", active: true)
    @foreign_employment = Clinic::Workforce::Employment.create!(practice: @foreign_practice,
      staff_member: @foreign_directory, membership: @foreign_membership,
      status: "active", effective_from: 1.hour.ago)
    @foreign_employment.employment_sites.create!(practice: @foreign_practice, site: @foreign_site,
      active: true, effective_from: 1.hour.ago)
  end

  test "employee context exposes only assigned sites and no clinical permissions" do
    login(@employee)

    get "/api/clinic/context", headers: @headers

    assert_response :success
    assert_equal [ @assigned_site.id ], response.parsed_body.fetch("sites").pluck("id")
    capabilities = response.parsed_body.fetch("capabilities")
    assert_equal true, capabilities.fetch("workforce_self")
    %w[
      patients patient_identity_read patients_write appointments appointments_read appointments_book
      encounters notes_read notes_write documents messages billing billing_read roles
    ].each do |permission|
      assert_equal false, capabilities.fetch(permission), "#{permission} must not follow from employment"
    end
  end

  test "practice workforce manager receives all practice sites without clinical authority" do
    login(@manager)

    get "/api/clinic/context", headers: @headers

    assert_response :success
    assert_equal [ @assigned_site.id, @other_site.id ].sort,
      response.parsed_body.fetch("sites").pluck("id").sort
    capabilities = response.parsed_body.fetch("capabilities")
    assert_equal true, capabilities.fetch("workforce_admin")
    assert_equal true, capabilities.fetch("workforce_settings")
    assert_equal true, capabilities.fetch("workforce_payroll_configure")
    assert_equal false, capabilities.fetch("patients")
    assert_equal false, capabilities.fetch("billing_read")
  end

  test "employee location selection persists only within assigned sites" do
    @employment.employment_sites.create!(practice: @practice, site: @other_site,
      active: true, effective_from: 1.hour.ago)
    login(@employee)
    patch "/api/clinic/context", params: { site_id: @other_site.id }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/context", headers: @headers
    assert_equal @other_site.id, response.parsed_body.dig("current_site", "id")
    patch "/api/clinic/context", params: { site_id: @foreign_site.id }, headers: csrf_headers, as: :json
    assert_response :not_found
  end

  test "preloaded employment sites preserve eligibility without per-site queries" do
    @employment.employment_sites.load
    queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        assert @employment.eligible_site?(@assigned_site)
        refute @employment.eligible_site?(@other_site)
      end
    end

    refute queries.any? { |sql| sql.match?(/FROM "clinic_workforce_employment_sites"/i) }, queries.join("\n")
  end

  test "tenant ID tampering cannot cross employment settings or payroll boundaries" do
    login(@manager)

    get "/api/clinic/workforce/employments", params: { practice_id: @foreign_practice.id }, headers: @headers
    assert_response :success
    returned_ids = response.parsed_body.fetch("employments").pluck("id")
    assert_not_includes returned_ids, @foreign_employment.id

    post "/api/clinic/workforce/employments", params: {
      employment: {
        staff_member_id: @foreign_directory.id,
        membership_id: @foreign_membership.id,
        site_ids: [ @foreign_site.id ],
        effective_from: Time.current.iso8601
      }
    }, headers: csrf_headers, as: :json
    assert_response :not_found

    get "/api/clinic/workforce/settings", params: { site_id: @foreign_site.id }, headers: @headers
    assert_response :not_found
    put "/api/clinic/workforce/settings", params: {
      workforce_settings: {
        scope_kind: "site",
        site_id: @foreign_site.id,
        effective_from: Time.current.iso8601,
        expected_revision: 0,
        values: { kiosk_enabled: false }
      }
    }, headers: csrf_headers, as: :json
    assert_response :not_found

    get "/api/clinic/workforce/payroll-exports", params: { site_id: @foreign_site.id }, headers: @headers
    assert_response :not_found
  end

  test "employee administration creates the directory record employment and role together" do
    employee_role = RoleVersion.find_or_create_by!(role_code: "workforce-employee", version: 1)
    linked_user = create_user("linked-workforce-employee")
    linked_membership = @practice.memberships.create!(user: linked_user)
    login(@manager)

    assert_difference("Clinic::Staff::Member.count", 1) do
      assert_difference("Clinic::Workforce::Employment.count", 1) do
        assert_difference("Clinic::RoleGrant.count", 1) do
          post "/api/clinic/workforce/employments", params: {
            employment: {
              display_name: "Morgan Reed",
              job_title: "Medical assistant",
              membership_id: linked_membership.id,
              role_version_id: employee_role.id,
              site_ids: [ @assigned_site.id ],
              effective_from: Time.current.iso8601
            }
          }, headers: csrf_headers, as: :json
          assert_response :created
        end
      end
    end

    employment = Clinic::Workforce::Employment.find(response.parsed_body.dig("employment", "id"))
    assert_equal "Morgan Reed", employment.staff_member.display_name
    assert_equal linked_membership.id, employment.membership_id
    assert_equal [ "workforce-employee" ],
      employment.membership.role_grants.active.includes(:role_version).map { |grant| grant.role_version.role_code }
  end

  test "inactive employment removes workforce self-service without changing host identity" do
    login(@employee)
    get "/api/clinic/context", headers: @headers
    assert_equal true, response.parsed_body.dig("capabilities", "workforce_self")

    @employment.update!(status: "inactive")
    get "/api/clinic/context", headers: @headers

    assert_response :success
    assert_equal false, response.parsed_body.dig("capabilities", "workforce_self")
    assert @employee.reload.active?
    assert @employee_membership.reload.active?
    get "/api/session", headers: @headers
    assert_response :success
    assert_equal @employee.id, response.parsed_body.dig("user", "id")
  end

  test "employee activation requires CSRF and remains blocked by the production release gate" do
    invited_staff = @practice.staff_members.create!(display_name: "Alex Rivera",
      job_title: "Medical assistant", active: true)
    invitation = Clinic::Workforce::EmployeeOnboarding.invite!(practice: @practice,
      staff_member: invited_staff, email_address: "invited-#{SecureRandom.hex(6)}@example.invalid",
      site_ids: [ @assigned_site.id ], effective_from: Time.current, actor: @manager)
    payload = {
      employee_activation: {
        token: invitation.fetch(:token),
        password: "New-workforce-account-2026!",
        password_confirmation: "New-workforce-account-2026!"
      }
    }

    post "/api/employee_activation", params: payload, as: :json
    assert_response :unprocessable_entity
    assert invitation.fetch(:invitation).reload.pending?

    deployed("staging") do
      post "/api/employee_activation", params: payload, headers: csrf_headers, as: :json
      assert_response :not_found
    end
    assert invitation.fetch(:invitation).reload.pending?
    assert_not User.exists?(email_address: invitation.fetch(:invitation).email_address)
  end

  private

  def create_user(label)
    User.create!(email_address: "#{label}-#{SecureRandom.hex(5)}@example.invalid",
      password: PASSWORD, active: true)
  end

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def deployed(environment)
    previous = [ Rails.env, ENV["APP_DEPLOYMENT_ENV"], ENV["APP_DEVELOPMENT_LOGIN"] ]
    Rails.env = "production"
    ENV["APP_DEPLOYMENT_ENV"] = environment
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    yield
  ensure
    Rails.env, ENV["APP_DEPLOYMENT_ENV"], ENV["APP_DEVELOPMENT_LOGIN"] = previous
  end
end
