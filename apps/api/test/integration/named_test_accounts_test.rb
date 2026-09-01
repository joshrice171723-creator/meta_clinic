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

  def enter(profile)
    post "/api/development_session", params: { profile: profile }, headers: csrf, as: :json
  end

  test "setup is atomic, repeatable and preserves progress and disabled status" do
    local_mode do
      assert_difference "User.count", 5 do
        Development::TestAccounts.prepare!
      end
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

  test "admin is explicitly scoped and ordinary test clients cannot self-elevate" do
    local_mode do
      Development::TestAccounts.prepare!
      enter("admin")
      assert_response :created
      get "/api/inquiries", headers: @headers
      assert_response :success
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
      omni = User.find_by!(email_address: "test-omni@example.invalid")

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
      get "/api/inquiries", headers: @headers
      assert_response :success

      patch "/api/development_access", params: { expected_user_id: omni.id, profile: "client" },
        headers: csrf, as: :json
      assert_response :success
      get "/api/clinic/context", headers: @headers
      assert response.parsed_body.fetch("capabilities").values.all?
      get "/api/settings", headers: @headers
      assert_response :success

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
