require "test_helper"

class PatientPortalTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    @origin = "http://localhost:3000"
    @headers = { "Origin" => @origin, "REMOTE_ADDR" => "127.0.0.1" }
  end

  def local_csrf
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  test "synthetic patient login receives only its assigned portal projection" do
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "test", "1"
    Development::TestAccounts.prepare!

    post "/api/development_session", params: { profile: "patient" }, headers: local_csrf, as: :json
    assert_response :created
    get "/api/patient_portal/context", headers: @headers
    assert_response :success
    body = response.parsed_body
    assert_equal "patient-portal-context-v1", body.fetch("schema_version")
    assert_equal true, body.fetch("development_only")
    assert_equal false, body.dig("capabilities", "payment_collection")
    assert body.fetch("notices").any?
    patient = User.find_by!(email_address: "synthetic-patient@example.invalid")
    assert_equal 1, Clinic::PatientPortal::Identity.available.where(user_id: patient.id).count
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end

  test "ordinary synthetic accounts cannot use the patient portal" do
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "test", "1"
    Development::TestAccounts.prepare!
    post "/api/development_session", params: { profile: "client-a" }, headers: local_csrf, as: :json
    assert_response :created
    get "/api/patient_portal/context", headers: @headers
    assert_response :not_found
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end
end
