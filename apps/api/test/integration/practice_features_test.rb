require "test_helper"

class PracticeFeaturesTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "features-admin@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  test "cash core is always on and insurance is an explicit versioned option" do
    get "/api/clinic/practice_features", headers: @headers
    assert_response :success
    assert response.parsed_body.fetch("core").values.all?
    assert_equal false, response.parsed_body.dig("optional", "insurance_workflows")
    assert_equal 0, response.parsed_body.fetch("current_version")

    key = SecureRandom.uuid
    put "/api/clinic/practice_features", params: {
      practice_features: {
        expected_version: 0, insurance_workflows_enabled: true,
        reason: "Synthetic clinic also bills insurance", request_key: key
      }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.dig("optional", "insurance_workflows")
    assert_equal 1, response.parsed_body.fetch("current_version")

    put "/api/clinic/practice_features", params: {
      practice_features: {
        expected_version: 0, insurance_workflows_enabled: true,
        reason: "Synthetic clinic also bills insurance", request_key: key
      }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 1, @practice.practice_feature_versions.count

    get "/api/clinic/context", headers: @headers
    assert_equal true, response.parsed_body.dig("features", "optional", "insurance_workflows")
  end

  test "a stale or unauthorized selection cannot change clinic features" do
    Clinic::Configuration::PracticeFeatures.revise(
      practice: @practice, actor: @user, expected_version: 0,
      insurance_workflows_enabled: false, reason: "Cash clinic baseline",
      request_key: SecureRandom.uuid
    )

    put "/api/clinic/practice_features", params: {
      practice_features: {
        expected_version: 0, insurance_workflows_enabled: true,
        reason: "Stale change", request_key: SecureRandom.uuid
      }
    }, headers: csrf_headers, as: :json
    assert_response :conflict

    revoke_all_permissions!(@membership)
    put "/api/clinic/practice_features", params: {
      practice_features: {
        expected_version: 1, insurance_workflows_enabled: true,
        reason: "Unauthorized change", request_key: SecureRandom.uuid
      }
    }, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal false, @practice.practice_feature_versions.order(:version).last.insurance_workflows_enabled
  end
end
