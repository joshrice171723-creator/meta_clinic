require "test_helper"

class PracticeFeaturesTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "practice-features@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  test "cash clinic core stays on while insurance is optional and versioned" do
    get "/api/clinic/practice_features", headers: @headers
    assert_response :success
    initial = response.parsed_body.fetch("features")
    assert_equal false, initial.fetch("insurance_workflows_enabled")
    %w[cash_pricing estimates invoices receipts card_payments refunds credits packages memberships].each do |feature|
      assert_equal true, initial.fetch("core").fetch(feature)
    end

    payload = { features: { insurance_workflows_enabled: true, expected_revision: 0, request_key: "enable-insurance" } }
    put "/api/clinic/practice_features", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.dig("features", "insurance_workflows_enabled")
    assert_equal 1, response.parsed_body.dig("features", "revision")

    put "/api/clinic/practice_features", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 1, Clinic::PracticeFeatureVersion.where(practice: @membership.practice).count
  end

  test "stale clinic setup edits do not overwrite a newer selection" do
    put "/api/clinic/practice_features", params: {
      features: { insurance_workflows_enabled: true, expected_revision: 0, request_key: "first-selection" }
    }, headers: csrf_headers, as: :json
    assert_response :success

    put "/api/clinic/practice_features", params: {
      features: { insurance_workflows_enabled: false, expected_revision: 0, request_key: "stale-selection" }
    }, headers: csrf_headers, as: :json
    assert_response :conflict
  end
end
