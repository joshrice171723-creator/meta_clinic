require "test_helper"

class NamedTestAccountsTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @origin = "http://localhost:3000"
    @headers = { "Origin" => @origin, "REMOTE_ADDR" => "127.0.0.1" }
    @sample = Launch::Material.create!(title: "Test onboarding", body: "Synthetic only", sample: true, published_at: Time.current)
    @restricted = Launch::Material.create!(title: "Restricted synthetic lesson", body: "Synthetic only", sample: false, published_at: Time.current)
  end

  def local_mode(environment = "development", flag: "1")
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = environment, flag
    yield
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end

  def csrf
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def enter(profile, portal: nil, practice_id: nil, site_id: nil)
    params = { profile: profile }
    params[:portal] = portal if portal
    params[:practice_id] = practice_id if practice_id
    params[:site_id] = site_id if site_id
    post "/api/development_session", params: params, headers: csrf, as: :json
  end

  test "setup is atomic, repeatable and preserves progress and disabled status" do
    local_mode do
      accounts = nil
      assert_difference "User.count", 8 do
        accounts = Development::TestAccounts.prepare!
      end
      assert_equal Development::TestAccounts::PROFILES.values.pluck(:email).sort,
        accounts.map(&:email_address).sort
      client = User.find_by!(email_address: "test-client-a@example.invalid")
      document = client.paperworks.sole
      document.begin_review!
      client.update!(active: false)
      assert_no_difference [ "User.count", "Launch::Paperwork.count", "Clinic::Practice.count" ] do
        Development::TestAccounts.prepare!
      end
      assert_equal "started", document.reload.status
      assert_not client.reload.active?
      enter("client-a")
      assert_response :unauthorized
    end
  end

  test "existing identity collision rolls back setup without adopting or changing the account" do
    user = User.create!(email_address: "test-client-a@example.invalid", password: SecureRandom.hex(20))
    digest = user.password_digest
    local_mode do
      assert_no_difference [ "User.count", "Launch::Paperwork.count", "Clinic::Practice.count" ] do
        assert_raises(Development::TestAccounts::Unavailable) { Development::TestAccounts.prepare! }
      end
      assert_equal digest, user.reload.password_digest
      enter("client-a")
      assert_response :unauthorized
    end
  end

  test "clients persist across logins but cannot share paperwork, training state, clinics or admin access" do
    local_mode do
      Development::TestAccounts.prepare!
      enter("client-a")
      assert_response :created
      first = User.find_by!(email_address: "test-client-a@example.invalid")
      get "/api/materials", headers: @headers
      assert_equal [ @sample.id ], response.parsed_body["materials"].pluck("id")
      post "/api/materials/#{@sample.id}/start", headers: csrf, as: :json
      assert_response :success
      post "/api/materials/#{@sample.id}/complete", headers: csrf, as: :json
      assert_response :success
      get "/api/inquiries", headers: @headers
      assert_response :forbidden
      enter("client-b")
      assert_response :created
      second = User.find_by!(email_address: "test-client-b@example.invalid")
      assert_not_equal first.clinic_membership.practice_id, second.clinic_membership.practice_id
      get "/api/paperworks/#{first.paperworks.sole.id}", headers: @headers
      assert_response :not_found
      get "/api/clinic/patients/#{first.clinic_membership.practice.patients.first.id}", headers: @headers
      assert_response :not_found
      assert_empty second.learning_progresses
      enter("client-a")
      assert_response :created
      get "/api/session", headers: @headers
      assert_equal first.id, response.parsed_body.dig("user", "id")
      assert_equal "completed", first.learning_progresses.sole.status
    end
  end

  test "development account choices include every persisted employee and patient principal" do
    local_mode do
      Development::TestAccounts.prepare!
      practice = Clinic::Practice.create!(name: "Development account switch test")
      employee = User.create!(email_address: "clinician1@test.com", password: SecureRandom.hex(20))
      membership = Clinic::Membership.create!(practice: practice, user: employee)
      role = RoleVersion.create!(role_code: "dev-seed-clinician", version: 1)
      membership.role_grants.create!(practice: practice, role_version: role, scope_kind: "practice",
        effective_from: 1.minute.ago, revision: 1)

      get "/api/csrf", headers: @headers
      assert_response :success
      assert_equal "development", response.parsed_body.fetch("environment")
      choices = response.parsed_body.fetch("development_accounts")
      patient = User.find_by!(email_address: "synthetic-patient@example.invalid")
      assert_includes choices.pluck("id"), "employee-#{employee.id}"
      assert_includes choices.pluck("id"), "patient-#{patient.id}"
      assert_equal Clinic::Membership.active.joins(:user).where(users: { active: true })
        .where.not(users: { email_address: Development::TestAccounts::PROFILES.fetch("omni").fetch(:email) }).count,
        choices.count { |account| account.fetch("account_type") == "employee" }
      assert_equal Clinic::PatientPortal::Identity.available.joins(:user).where(users: { active: true }).count,
        choices.count { |account| account.fetch("account_type") == "patient" }

      enter("employee-#{employee.id}")
      assert_response :created
      persisted = User.find_by!(email_address: "clinician1@test.com")
      assert_equal persisted.id, response.parsed_body.dig("user", "id")
      assert_equal "employee-#{employee.id}", response.parsed_body.dig("user", "development_account_id")
      assert_equal "/clinic", response.parsed_body.fetch("destination")
      assert_equal persisted.id, MemberSession.order(:id).last.user_id
      get "/api/session", headers: @headers
      assert_equal persisted.id, response.parsed_body.dig("user", "id")

      enter("patient-#{patient.id}")
      assert_response :created
      assert_equal patient.id, response.parsed_body.dig("user", "id")
      assert_equal "patient-#{patient.id}", response.parsed_body.dig("user", "development_account_id")
      assert_equal "/patient-portal", response.parsed_body.fetch("destination")
    end
  end

  test "development portal selection accepts only its eligible account type" do
    local_mode do
      Development::TestAccounts.prepare!
      accounts = Development::TestAccounts.preview_accounts
      employee = accounts.find { |account| account.fetch(:account_type) == "employee" }
      patient = accounts.find { |account| account.fetch(:account_type) == "patient" }
      omni = accounts.find { |account| account.fetch(:account_type) == "omni" }

      enter(patient.fetch(:id), portal: "clinic")
      assert_response :unprocessable_entity
      assert_equal "The selected account cannot enter that portal.", response.parsed_body.fetch("error")

      enter(employee.fetch(:id), portal: "patient")
      assert_response :unprocessable_entity

      enter(patient.fetch(:id), portal: "patient")
      assert_response :created
      assert_equal "/patient-portal", response.parsed_body.fetch("destination")

      enter(omni.fetch(:id), portal: "owner")
      assert_response :created
      assert_equal "/owner", response.parsed_body.fetch("destination")

      enter(omni.fetch(:id), portal: "launch")
      assert_response :created
      assert_equal "/portal", response.parsed_body.fetch("destination")

      enter(omni.fetch(:id), portal: "clinic")
      assert_response :created
      assert_equal "/clinic", response.parsed_body.fetch("destination")
    end
  end

  test "Omni can enter any location in any clinic" do
    local_mode do
      Development::TestAccounts.prepare!
      omni = Development::TestAccounts.preview_accounts.find { |account| account.fetch(:id) == "omni" }
      practice = Clinic::Practice.create!(name: "Secondary synthetic clinic")
      second_site = practice.sites.create!(name: "Secondary synthetic location", code: "SECONDARY")

      enter("omni", portal: "clinic", practice_id: practice.id, site_id: second_site.id)

      assert_response :created
      assert_equal "/clinic", response.parsed_body.fetch("destination")
      assert_equal "omni", response.parsed_body.dig("user", "development_account_id")
      assert_equal practice.id, session[:clinic_membership_id] && Clinic::Membership.find(session[:clinic_membership_id]).practice_id
      assert_equal second_site.id, session[:clinic_site_id]
    end
  end

  test "dynamic development account ids resolve without exposing account addresses" do
    local_mode do
      practice = Clinic::Practice.create!(name: "Dynamic account clinic")
      employee = User.create!(email_address: "dynamic-employee@example.invalid", password: SecureRandom.hex(20))
      membership = Clinic::Membership.create!(practice: practice, user: employee)
      role = RoleVersion.create!(role_code: "dynamic-account-role", version: 1)
      membership.role_grants.create!(practice: practice, role_version: role, scope_kind: "practice",
        effective_from: 1.minute.ago, revision: 1)

      account = Development::TestAccounts.preview_accounts.find { |candidate| candidate[:id] == "employee-#{employee.id}" }
      assert account
      assert_not account.key?(:email_address)
      assert_equal employee, Development::TestAccounts.sign_in_account(account.fetch(:id))
      assert Development::TestAccounts.matches?(employee, account.fetch(:id))
      assert_equal account, Development::TestAccounts.preview_account_for(employee, profile: account.fetch(:id))

      queries = []
      ActiveSupport::Notifications.subscribed(->(*args) { queries << args.last[:sql] }, "sql.active_record") do
        assert_equal employee, Development::TestAccounts.sign_in_account(account.fetch(:id))
        assert Development::TestAccounts.matches?(employee, account.fetch(:id))
        assert_equal account, Development::TestAccounts.preview_account_for(employee, profile: account.fetch(:id))
      end
      assert_not queries.any? { |sql| sql.include?("clinic_patient_portal_identities") }, "Checking one employee must not enumerate patient accounts"

      enter(account.fetch(:id))
      assert_response :created
      assert_equal account.fetch(:id), response.parsed_body.dig("user", "development_account_id")
      assert_equal "/clinic", response.parsed_body.fetch("destination")
      patch "/api/development_date", params: { date: "2000-01-01" }, headers: csrf, as: :json
      assert_response :success
      get "/api/session", headers: @headers
      assert_response :success
      assert_equal account.fetch(:id), response.parsed_body.dig("user", "development_account_id")

      membership.update!(active: false)
      assert_nil Development::TestAccounts.sign_in_account(account.fetch(:id))
      assert_not Development::TestAccounts.matches?(employee, account.fetch(:id))
      get "/api/session", headers: @headers
      assert_response :unauthorized
    end
  end

  test "app date preserves Omni and patient sessions without restoring revoked access" do
    local_mode do
      practice = Clinic::Practice.create!(name: "Clock boundary clinic")
      omni = User.create!(email_address: "omni@test.com", admin: false,
        password: Development::TestAccounts.send(:password_for, "omni"))
      membership = Clinic::Membership.create!(practice: practice, user: omni)
      role = RoleVersion.create!(role_code: "development-omni-clinician", version: 1)
      grant = membership.role_grants.create!(practice: practice, role_version: role,
        scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)
      patient_user = User.create!(email_address: "clock-patient@example.invalid", password: SecureRandom.hex(20))
      patient = practice.patients.create!(display_name: "Clock Patient", reference: "CLOCK-PATIENT")
      identity = Clinic::PatientPortal::Identity.create!(practice: practice, patient: patient, user: patient_user,
        status: :active, invited_at: Time.current, activated_at: Time.current)

      patch "/api/development_date", params: { date: "2000-01-01" }, headers: csrf, as: :json
      assert_response :success
      enter("omni")
      assert_response :created
      assert_equal "/clinic", response.parsed_body.fetch("destination")
      assert_equal "omni", response.parsed_body.dig("user", "development_account_id")
      get "/api/csrf", headers: @headers
      assert_equal "2000-01-01", response.parsed_body.fetch("business_date")
      assert_includes response.parsed_body.fetch("development_accounts").pluck("id"), "omni"
      get "/api/session", headers: @headers
      assert_response :success
      grant.update!(revoked_at: Time.current)
      get "/api/session", headers: @headers
      assert_response :unauthorized
      assert_nil Development::TestAccounts.sign_in_account("omni")
      assert_nil Development::TestAccounts.sign_in_account("employee-#{omni.id}")

      enter("patient-#{patient_user.id}")
      assert_response :created
      assert_equal "/patient-portal", response.parsed_body.fetch("destination")
      assert_equal "patient-#{patient_user.id}", response.parsed_body.dig("user", "development_account_id")
      assert_nil Development::TestAccounts.sign_in_account("employee-#{patient_user.id}")
      identity.update!(status: :revoked, revoked_at: Time.current)
      assert_nil Development::TestAccounts.sign_in_account("patient-#{patient_user.id}")
      get "/api/session", headers: @headers
      assert_response :unauthorized
    end
  end

  test "admin is explicitly scoped and ordinary test clients cannot self-elevate" do
    local_mode do
      Development::TestAccounts.prepare!
      enter("admin")
      assert_response :created
      get "/api/inquiries", headers: @headers
      assert_response :forbidden
      get "/api/clinic", headers: @headers
      assert_response :forbidden
      enter("client-a")
      assert_response :created
      User.find_by!(email_address: "test-client-a@example.invalid").update!(admin: true)
      get "/api/session", headers: @headers
      assert_response :unauthorized
      enter("client-a")
      assert_response :unauthorized
      assert_raises(Development::TestAccounts::Unavailable) { Development::TestAccounts.prepare! }
    end
  end

  test "OmniLogin switches UI profiles without limiting development access" do
    local_mode do
      Development::TestAccounts.prepare!
      enter("omni")
      assert_response :created
      omni = User.find_by!(email_address: "omni@test.com")
      practice = omni.clinic_membership.practice

      assert_equal 30, practice.patients.where("reference LIKE ?", "SYN-OMNI-%").count
      assert_equal 12, practice.encounter_notes.where(note_kind: "soap").count
      assert_equal 105, practice.observations.where(value_kind: "numeric").count
      assert_equal 6, practice.encounters.open.count
      assert_equal 6, practice.encounters.open.joins(:room).distinct.count("clinic_rooms.code")

      get "/api/settings", headers: @headers
      assert_response :success
      assert_equal "administrator", response.parsed_body.dig("development_access", "profile")
      assert_equal %w[administrator clinician staff inventory reader client],
        response.parsed_body.dig("development_access", "options").pluck("id")
      get "/api/inquiries", headers: @headers
      assert_response :success

      patch "/api/development_access", params: { expected_user_id: omni.id, profile: "clinician" },
        headers: csrf, as: :json
      assert_response :success
      assert_equal "clinician", response.parsed_body.dig("development_access", "profile")
      assert_not omni.reload.admin?
      get "/api/session", headers: @headers
      assert_equal omni.id, response.parsed_body.dig("user", "id")
      get "/api/clinic/context", headers: @headers
      assert_response :success
      assert_equal true, response.parsed_body.dig("capabilities", "patients")
      assert_equal true, response.parsed_body.dig("capabilities", "patients_write")
      assert_equal true, response.parsed_body.dig("capabilities", "encounters")
      assert_equal true, response.parsed_body.dig("capabilities", "inventory")
      assert_equal true, response.parsed_body.dig("capabilities", "roles")
      assert_equal true, response.parsed_body.dig("capabilities", "scribe_read")
      assert_equal true, response.parsed_body.dig("capabilities", "scribe_write")
      get "/api/inquiries", headers: @headers
      assert_response :success

      patch "/api/development_access", params: { expected_user_id: omni.id, profile: "client" },
        headers: csrf, as: :json
      assert_response :success
      get "/api/clinic/context", headers: @headers
      capabilities = response.parsed_body.fetch("capabilities")
      assert_not Clinic::Workforce::Employment.exists?(membership_id: omni.clinic_membership.id)
      assert_equal false, capabilities.fetch("workforce_self")
      permission_capabilities = capabilities.except("workforce_self")
      assert permission_capabilities.values.all?,
        "Unavailable permissions: #{permission_capabilities.reject { |_key, value| value }.keys.join(', ')}"
      inventory_permissions = omni.clinic_membership.role_grants.active.sole.role_version.permissions
        .where("action_code LIKE 'inventory.%' OR action_code LIKE 'procurement.%' OR action_code LIKE 'recall.%' OR action_code LIKE 'controlled.%'")
        .pluck(:action_code)
      assert_equal Development::OmniAccess::INVENTORY_DATABASE_PERMISSIONS.sort, inventory_permissions.sort
      assert_nothing_raised do
        Development::InventoryScenario.populate!(practice: practice, actor: omni)
      end
      assert_equal "II", practice.pharmacy_products.find_by!(sku: "SYN-DEX-010").dea_schedule
      get "/api/settings", headers: @headers
      assert_response :success
      tables = ApplicationRecord.connection.tables - %w[schema_migrations ar_internal_metadata]
      counts = -> { tables.to_h { |table| [ table, ApplicationRecord.connection.select_value("SELECT COUNT(*) FROM #{ApplicationRecord.connection.quote_table_name(table)}") ] } }
      before = counts.call
      Development::TestAccounts.prepare!
      assert_equal before, counts.call
      assert_equal "client", Development::OmniAccess.profile_for(omni.reload)

      patch "/api/development_access", params: { expected_user_id: omni.id, profile: "administrator" },
        headers: csrf, as: :json
      assert_response :success
      assert omni.reload.admin?
      get "/api/inquiries", headers: @headers
      assert_response :success
      assert_equal 1, omni.clinic_membership.role_grants.active.count

      assert_no_changes -> { Development::OmniAccess.profile_for(omni.reload) } do
        patch "/api/development_access", params: { expected_user_id: omni.id, profile: "unknown" },
          headers: csrf, as: :json
        assert_response :unprocessable_entity
      end
    end
  end

  test "development view switching is hidden from ordinary and production sessions" do
    local_mode do
      Development::TestAccounts.prepare!
      enter("client-a")
      client = User.find_by!(email_address: "test-client-a@example.invalid")
      patch "/api/development_access", params: { expected_user_id: client.id, profile: "administrator" },
        headers: csrf, as: :json
      assert_response :not_found
      assert_not client.reload.admin?
    end
    local_mode("production") do
      patch "/api/development_access", params: { expected_user_id: 1, profile: "administrator" },
        headers: csrf, as: :json
      assert_response :not_found
    end
  end

  test "unknown, blank and disabled choices deny without creating accounts or sessions" do
    local_mode do
      Development::TestAccounts.prepare!
      [ "disabled", "unknown", "", "test-admin@example.invalid", nil, [], { role: "admin" } ].each do |profile|
        assert_no_difference [ "User.count", "MemberSession.count" ] do
          enter(profile)
          assert_response :unauthorized
        end
      end
    end
  end

  test "named login and existing sessions require flag, loopback, origin, CSRF and development" do
    local_mode do
      Development::TestAccounts.prepare!
      post "/api/development_session", params: { profile: "admin" }, headers: @headers, as: :json
      assert_response :unprocessable_entity
      post "/api/development_session", params: { profile: "admin" }, headers: csrf.merge("Origin" => "http://untrusted.example"), as: :json
      assert_response :unprocessable_entity
      post "/api/development_session", params: { profile: "admin" }, headers: csrf.merge("REMOTE_ADDR" => "203.0.113.20"), as: :json
      assert_response :not_found
      enter("admin")
      assert_response :created
    end
    [ [ "development", nil ], [ "production", "1" ], [ "test", "1" ] ].each do |environment, flag|
      local_mode(environment, flag: flag) do
        get "/api/session", headers: @headers
        assert_response :unauthorized
        enter("admin")
        assert_response :not_found
        unless environment == "test"
          assert_raises(Development::TestAccounts::Unavailable) { Development::TestAccounts.prepare! }
        end
      end
    end
  end

  test "named fixtures cannot use password login to bypass local-only access" do
    local_mode do
      Development::TestAccounts.prepare!
      password = Development::TestAccounts.send(:password_for, "admin")
      post "/api/session", params: { email_address: "test-admin@example.invalid", password: password }, headers: csrf, as: :json
      assert_response :unauthorized
      assert_equal 0, MemberSession.count
    end
  end

  test "password reset and deactivation revoke named sessions without silently repairing access" do
    local_mode do
      Development::TestAccounts.prepare!
      enter("client-a")
      assert_response :created
      client = User.find_by!(email_address: "test-client-a@example.invalid")
      client.update!(password: SecureRandom.hex(20))
      get "/api/session", headers: @headers
      assert_response :unauthorized
      enter("client-a")
      assert_response :unauthorized
      assert_raises(Development::TestAccounts::Unavailable) { Development::TestAccounts.prepare! }

      enter("admin")
      assert_response :created
      User.find_by!(email_address: "test-admin@example.invalid").update!(active: false)
      get "/api/inquiries", headers: @headers
      assert_response :unauthorized
      enter("admin")
      assert_response :unauthorized
    end
  end

  test "existing named sessions reject a non-loopback host or peer and a mismatched origin" do
    local_mode do
      Development::TestAccounts.prepare!
      enter("admin")
      assert_response :created
      get "/api/inquiries", headers: @headers.merge("REMOTE_ADDR" => "203.0.113.20")
      assert_response :unauthorized
      get "/api/inquiries", headers: @headers.merge("Origin" => "http://untrusted.example")
      assert_response :unauthorized
      host! "www.example.com"
      get "/api/inquiries", headers: @headers.merge("Origin" => "http://www.example.com")
      assert_response :unauthorized
    end
  end
end
