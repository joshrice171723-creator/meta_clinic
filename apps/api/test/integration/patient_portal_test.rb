require "test_helper"

class PatientPortalTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @origin = "http://localhost:3000"
    @headers = { "Origin" => @origin, "REMOTE_ADDR" => "127.0.0.1" }
  end

  def local_csrf
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  test "synthetic patient login receives only its assigned portal projection" do
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
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

    request = {
      appointment_request: {
        request_key: "patient-portal-test-1",
        starts_at: 2.days.from_now.iso8601,
        ends_at: (2.days.from_now + 2.hours).iso8601
      }
    }
    post "/api/patient_portal/appointment_requests", params: request, headers: local_csrf, as: :json
    assert_response :created
    assert_equal "pending", response.parsed_body.dig("appointment_request", "status")
    post "/api/patient_portal/appointment_requests", params: request, headers: local_csrf, as: :json
    assert_response :success
    post "/api/patient_portal/appointment_requests", params: {
      appointment_request: { request_key: "patient-portal-test-bad", starts_at: 2.days.from_now.iso8601, ends_at: 1.day.from_now.iso8601 }
    }, headers: local_csrf, as: :json
    assert_response :unprocessable_entity

    request_payload = {
      patient_portal_request: {
        request_key: "patient-portal-message-1",
        request_type: "message",
        content: "Please call me about my next visit."
      }
    }
    post "/api/patient_portal/requests", params: request_payload, headers: local_csrf, as: :json
    assert_response :created
    assert_equal "pending", response.parsed_body.dig("request", "status")
    first_request_id = response.parsed_body.dig("request", "id")
    post "/api/patient_portal/requests", params: request_payload, headers: local_csrf, as: :json
    assert_response :success
    assert_equal first_request_id, response.parsed_body.dig("request", "id")
    post "/api/patient_portal/requests", params: request_payload.deep_merge(
      patient_portal_request: { content: "A different message" }
    ), headers: local_csrf, as: :json
    assert_response :unprocessable_entity
    get "/api/patient_portal/context", headers: @headers
    assert_equal "message", response.parsed_body.fetch("requests").first.fetch("request_type")
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end

  test "ordinary synthetic accounts cannot use the patient portal" do
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Development::TestAccounts.prepare!
    post "/api/development_session", params: { profile: "client-a" }, headers: local_csrf, as: :json
    assert_response :created
    get "/api/patient_portal/context", headers: @headers
    assert_response :not_found
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end
end
