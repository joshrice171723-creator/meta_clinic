require "test_helper"

class DevelopmentLoginTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @origin = "http://localhost:3000"
    @sample = Launch::Material.create!(title: "Sample operations", body: "Synthetic lesson", sample: true, published_at: Time.current)
  end

  def with_environment(name = "development", flag: "1")
    previous = ENV["APP_DEVELOPMENT_LOGIN"]
    previous_environment = Rails.env
    ENV["APP_DEVELOPMENT_LOGIN"] = flag
    Rails.env = name
    yield
  ensure
    ENV["APP_DEVELOPMENT_LOGIN"] = previous
    Rails.env = previous_environment
  end

  def headers
    { "Origin" => @origin, "REMOTE_ADDR" => "127.0.0.1" }
  end

  def csrf
    get "/api/csrf", headers: headers
    headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def enter_demo
    post "/api/development_session", headers: csrf, as: :json
    assert_response :created
    get "/api/session", headers: headers
    assert_response :success
    assert_equal true, response.parsed_body.dig("user", "development_demo")
    user = User.find(response.parsed_body.dig("user", "id"))
    assert_equal "employee-#{user.id}", response.parsed_body.dig("user", "development_account_id")
    user
  end

  test "disabled by default and in production even when explicitly flagged" do
    [ [ "development", nil ], [ "development", "0" ], [ "test", "1" ], [ "production", "1" ] ].each do |name, flag|
      with_environment(name, flag: flag) do
        token = csrf
        assert_equal false, response.parsed_body["development_login"]
        assert_no_difference "User.count" do
          post "/api/development_session", headers: token, as: :json
          assert_response :not_found
        end
      end
    end
  end

  test "requires CSRF and loopback host, origin and peer" do
    with_environment do
      post "/api/development_session", headers: headers, as: :json
      assert_response :unprocessable_entity
      post "/api/development_session", headers: csrf.merge("Origin" => "http://evil.example"), as: :json
      assert_response :unprocessable_entity
      post "/api/development_session", headers: csrf.merge("REMOTE_ADDR" => "203.0.113.20"), as: :json
      assert_response :not_found
      host! "www.example.com"
      @origin = "http://www.example.com"
      post "/api/development_session", headers: csrf, as: :json
      assert_response :not_found
    end
  end

  test "default local login uses the validated clinic administrator profile without a password" do
    with_environment do
      first = enter_demo
      assert first.admin?
      assert_equal Development::RoleAccounts::PRACTICE_NAME, first.clinic_membership.practice.name
      assert first.clinic_membership.role_grants.active.joins(:role_version)
        .exists?(role_versions: { role_code: "clinic-administrator" })
      get "/api/clinic", headers: headers
      assert_response :success

      second = enter_demo
      assert_equal first.id, second.id
      assert_equal first.clinic_membership.practice_id, second.clinic_membership.practice_id
    end
  end

  test "hosted workspace tools require a signed in active owner or admin" do
    host! "aimetaclinic.com"
    @origin = "http://aimetaclinic.com"
    with_environment("production", flag: nil) do
      token = csrf
      assert_equal false, response.parsed_body.fetch("development_login")
      post "/api/development_session", params: { profile: "omni" }, headers: token, as: :json
      assert_response :not_found

      [ [false, false], [true, false], [false, true] ].each_with_index do |(admin, owner), index|
        user = User.create!(email_address: "hosted-tools-#{index}@example.invalid", active: true,
          admin: admin, platform_owner: owner, password: "Synthetic-password-123!")
        post "/api/session", params: { email_address: user.email_address, password: "Synthetic-password-123!" }, headers: csrf, as: :json
        assert_response :success
        token = csrf
        assert_equal admin || owner, response.parsed_body.fetch("development_login")
        get "/api/session", headers: headers
        assert_equal admin || owner, response.parsed_body.dig("user", "workspace_tools")
        patch "/api/development_date", params: { date: "2032-04-15" }, headers: token, as: :json
        assert_response(admin || owner ? :success : :not_found)
        delete "/api/session", headers: csrf, as: :json
        assert_response :no_content
        get "/api/csrf", headers: headers
        assert_equal false, response.parsed_body.fetch("development_login")
      end
    end
  end

  test "hosted switches retain owner authorization and stop after owner revocation" do
    owner = User.create!(email_address: "hosted-switch-owner@example.invalid", active: true,
      platform_owner: true, password: "Synthetic-password-123!")
    employee = User.create!(email_address: "hosted-switch-employee@example.invalid", active: true,
      password: "Synthetic-password-123!")
    membership = Development::TestClinic.create!(employee)
    host! "aimetaclinic.com"
    @origin = "http://aimetaclinic.com"
    with_environment("production", flag: nil) do
      post "/api/session", params: { email_address: owner.email_address, password: "Synthetic-password-123!" }, headers: csrf, as: :json
      assert_response :success
      owner_session = owner.member_sessions.sole
      2.times do
        post "/api/development_session", params: { profile: "employee-#{employee.id}", portal: "clinic", practice_id: membership.practice_id }, headers: csrf, as: :json
        assert_response :created
        assert_equal true, response.parsed_body.dig("user", "workspace_tools")
        assert MemberSession.exists?(owner_session.id)
        get "/api/clinic/context", headers: headers
        assert_response :success
      end
      owner_session.destroy!
      get "/api/session", headers: headers
      assert_response :unauthorized
      post "/api/development_session", params: { profile: "omni" }, headers: csrf, as: :json
      assert_response :not_found
    end
  end

  test "hosted owner role removal and expiry revoke workspace tools" do
    owner = User.create!(email_address: "hosted-expiring-owner@example.invalid", active: true,
      platform_owner: true, password: "Synthetic-password-123!")
    host! "aimetaclinic.com"
    @origin = "http://aimetaclinic.com"
    with_environment("production", flag: nil) do
      post "/api/session", params: { email_address: owner.email_address, password: "Synthetic-password-123!" }, headers: csrf, as: :json
      assert_response :success
      owner.update!(platform_owner: false)
      get "/api/csrf", headers: headers
      assert_equal false, response.parsed_body.fetch("development_login")
      owner.update!(platform_owner: true)
      owner.member_sessions.sole.update!(expires_at: 1.minute.ago)
      get "/api/csrf", headers: headers
      assert_equal false, response.parsed_body.fetch("development_login")
    end
  end

  test "hosted owner can provision Omni and logout revokes both sessions" do
    owner = User.create!(email_address: "hosted-omni-owner@example.invalid", active: true,
      platform_owner: true, password: "Synthetic-password-123!")
    host! "aimetaclinic.com"
    @origin = "http://aimetaclinic.com"
    with_environment("production", flag: nil) do
      post "/api/session", params: { email_address: owner.email_address, password: "Synthetic-password-123!" }, headers: csrf, as: :json
      assert_response :success
      token = csrf
      assert response.parsed_body.fetch("development_accounts").any? { |account| account.fetch("id") == "omni" }
      post "/api/development_session", params: { profile: "omni", portal: "clinic" }, headers: token, as: :json
      assert_response :created
      omni_id = response.parsed_body.dig("user", "id")
      get "/api/clinic/context", headers: headers
      assert_response :success
      delete "/api/session", headers: csrf, as: :json
      assert_response :no_content
      assert_empty owner.member_sessions.reload
      assert_empty MemberSession.where(user_id: omni_id)
      get "/api/csrf", headers: headers
      assert_equal false, response.parsed_body.fetch("development_login")
    end
  end

  test "clinic login infers the only authorized location when scope ids are omitted" do
    with_environment do
      Development::TestAccounts.prepare!
      user = User.create!(email_address: "single-location-employee@example.invalid", active: true,
        admin: false, password: SecureRandom.hex(20))
      membership = Development::TestClinic.create!(user)
      site = membership.practice.sites.create!(code: "ONLY", name: "Only clinic location")
      account = Development::TestAccounts.preview_accounts.find { |candidate| candidate.fetch(:id) == "employee-#{user.id}" }
      assert account
      assert_equal [ site.id ], account.fetch(:locations).pluck(:id)

      post "/api/development_session", params: { profile: account.fetch(:id), portal: "clinic" }, headers: csrf, as: :json
      assert_response :created
      assert_equal "/clinic", response.parsed_body.fetch("destination")
      assert_equal account.fetch(:id), response.parsed_body.dig("user", "development_account_id")

      get "/api/clinic/context", headers: headers
      assert_response :success
      assert_equal account.fetch(:locations).first.fetch(:id), response.parsed_body.dig("current_site", "id")
    end
  end

  test "omni clinic login can create a membership in the selected practice" do
    with_environment do
      Development::TestAccounts.prepare!
      practice = Clinic::Practice.create!(name: "Scoped Omni Clinic")
      site = practice.sites.create!(code: "OMNI", name: "Omni clinic location")

      post "/api/development_session",
        params: { profile: "omni", portal: "clinic", practice_id: practice.id, site_id: site.id },
        headers: csrf, as: :json

      assert_response :created
      assert_equal "/clinic", response.parsed_body.fetch("destination")
      membership = Clinic::Membership.find_by!(user_id: response.parsed_body.dig("user", "id"), practice: practice)
      assert membership.active?
      get "/api/clinic/context", headers: headers
      assert_response :success
      assert_equal site.id, response.parsed_body.dig("current_site", "id")
    end
  end

  test "existing demo sessions stop working after flag removal or outside development" do
    with_environment { enter_demo }
    [ [ "development", nil ], [ "production", "1" ] ].each do |name, flag|
      with_environment(name, flag: flag) do
        get "/api/session", headers: headers
        assert_response :unauthorized
      end
    end
  end

  test "default local session stops working when its employee profile is no longer eligible" do
    with_environment do
      user = enter_demo
      user.clinic_membership.update!(active: false)
      get "/api/session", headers: headers
      assert_response :unauthorized
    end
  end

  test "local access cannot sign restricted documents" do
    with_environment do
      user = enter_demo
      document = user.paperworks.create!(title: "Restricted agreement", body: "Agreement", document_version: "test-v1", demo: false)
      post "/api/paperworks/#{document.id}/start", headers: csrf, as: :json
      post "/api/paperworks/#{document.id}/sign", params: { consent: true, signature_name: "Alex Example", content_digest: document.content_digest }, headers: csrf, as: :json
      assert_response :unauthorized
      assert_nil document.reload.signed_at
    end
  end

  test "normal login cannot request the development signing shortcut" do
    with_environment do
      password = SecureRandom.hex(20)
      user = User.create!(email_address: "normal@example.invalid", password: password)
      document = Launch::Paperwork.assign_demo!(user)
      post "/api/session", params: { email_address: user.email_address, password: password, development_demo: true }, headers: csrf, as: :json
      assert_response :success
      get "/api/session", headers: headers
      assert_equal false, response.parsed_body.dig("user", "development_demo")
      post "/api/paperworks/#{document.id}/start", headers: csrf, as: :json
      post "/api/paperworks/#{document.id}/sign", params: { consent: true, signature_name: "Alex Example", content_digest: document.content_digest, development_demo: true }, headers: csrf, as: :json
      assert_response :unauthorized
    end
  end

  test "development date drives workflow dates, survives account switches and resets to today" do
    with_environment do
      Development::TestAccounts.prepare!
      token = csrf
      patch "/api/development_date", params: { date: "2032-04-15" }, headers: token, as: :json
      assert_response :success
      assert_equal "2032-04-15", response.parsed_body.fetch("business_date")

      post "/api/development_session", params: { profile: "customer-client-a" }, headers: csrf, as: :json
      assert_response :created
      assert_equal "/portal", response.parsed_body.fetch("destination")
      assert_equal "customer-client-a", response.parsed_body.dig("user", "development_account_id")
      post "/api/materials/#{@sample.id}/start", headers: csrf, as: :json
      assert_response :success
      account = User.find_by!(email_address: "test-client-a@example.invalid")
      assert_equal Date.new(2032, 4, 15), account.learning_progresses.find_by!(material: @sample).started_at.to_date
      get "/api/csrf", headers: headers
      assert_equal "2032-04-15", response.parsed_body.fetch("business_date")

      patch "/api/development_date", params: { date: "" }, headers: csrf, as: :json
      assert_response :success
      assert_equal Date.current.iso8601, response.parsed_body.fetch("business_date")
      get "/api/csrf", headers: headers
      assert_equal Date.current.iso8601, response.parsed_body.fetch("business_date")
    end
  end

  test "development date rejects invalid values and is unavailable outside local development" do
    with_environment do
      patch "/api/development_date", params: { date: "not-a-date" }, headers: csrf, as: :json
      assert_response :unprocessable_entity
      patch "/api/development_date", params: { date: "1999-12-31" }, headers: csrf, as: :json
      assert_response :unprocessable_entity
    end

    with_environment("production") do
      token = csrf
      assert_equal "production", response.parsed_body.fetch("environment")
      assert_empty response.parsed_body.fetch("development_accounts")
      patch "/api/development_date", params: { date: "2032-04-15" }, headers: token, as: :json
      assert_response :not_found
    end
  end
end
