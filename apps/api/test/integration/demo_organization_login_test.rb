require "test_helper"

class DemoOrganizationLoginTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @previous_environment = Rails.env
    @previous = ENV.to_h.slice("APP_DEVELOPMENT_LOGIN", "APP_DEPLOYMENT_ENV", "APP_GUIDED_DEMO", "PGDATABASE")
    Rails.env = "development"
    ENV["APP_DEVELOPMENT_LOGIN"] = "1"
    @user = User.create!(email_address: Development::TestAccounts::PROFILES.fetch("omni").fetch(:email),
      password: Development::TestAccounts.send(:password_for, "omni"), active: true)
    @membership = Development::TestClinic.create!(@user, permissions: [])
    Development::OmniAccess.send(:ensure_roles!)
    Development::OmniAccess.send(:switch_locked!, @user, @membership, "administrator")
    @membership.practice.sites.create!(code: "MAIN", name: "Original location")
    @details = { organization_name: "Investor Demo Group", clinic_name: "Investor Demo Clinic", location_name: "Downtown" }
  end

  teardown do
    Rails.env = @previous_environment
    %w[APP_DEVELOPMENT_LOGIN APP_DEPLOYMENT_ENV APP_GUIDED_DEMO PGDATABASE].each { |key| ENV[key] = @previous[key] }
  end

  def headers
    { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
  end

  def enter(details = @details)
    get "/api/csrf", headers: headers
    token = response.parsed_body.fetch("csrf_token")
    post "/api/development_session", as: :json,
      headers: headers.merge("X-CSRF-Token" => token),
      params: { profile: "omni", portal: "clinic", new_organization: details }
  end

  test "new organization persists clinic and location with Omni and safe repeat entry" do
    assert_difference [ "Organization.count", "Clinic::Practice.count", "Clinic::Site.count" ], 1 do
      enter
      assert_response :created
    end
    get "/api/clinic/context", headers: headers
    assert_response :success
    assert_equal "Downtown", response.parsed_body.dig("current_site", "name")
    assert_equal true, response.parsed_body.dig("capabilities", "psychotherapy_notes")
    practice = Organization.find_by!(name: @details[:organization_name]).practices.first!
    assert Ability.new(@user, practice:).allowed_permission?("roles.manage")
    assert Ability.new(@user, practice:).allowed_permission?("billing.invoice_post")
    assert_no_difference [ "Organization.count", "Clinic::Practice.count", "Clinic::Site.count" ] do
      enter
      assert_response :created
    end
    get "/api/csrf", headers: headers
    assert response.parsed_body.fetch("development_accounts").any? { |account| account.dig("clinic", "id") == practice.id }
  end

  test "invalid names leave no partial organization" do
    assert_no_difference [ "Organization.count", "Clinic::Practice.count", "Clinic::Site.count" ] do
      enter(@details.merge(location_name: " "))
      assert_response :unprocessable_entity
    end
  end

  test "hosted Omni requires the isolated staging demo database and same origin" do
    Rails.env = "production"
    ENV["APP_DEPLOYMENT_ENV"] = "staging"
    ENV["APP_GUIDED_DEMO"] = "1"
    ENV["PGDATABASE"] = "apply_guided_demo"
    assert_no_difference "User.count" do
      Development::TestAccounts.prepare_omni!
    end
    enter
    assert_response :created
    get "/api/clinic/context", headers: headers
    assert_response :success
    get "/api/csrf", headers: headers
    token = response.parsed_body.fetch("csrf_token")
    post "/api/development_session", params: { profile: "omni", portal: "owner" }, as: :json,
      headers: headers.merge("X-CSRF-Token" => token, "Origin" => "https://other.example")
    assert_response :unprocessable_entity

    ENV["PGDATABASE"] = "apply"
    get "/api/csrf", headers: headers
    assert_equal false, response.parsed_body.fetch("development_login")
    assert_empty response.parsed_body.fetch("development_accounts")
    enter
    assert_response :not_found
  end
end
