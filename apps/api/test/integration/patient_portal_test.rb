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
    assert_equal true, body.dig("capabilities", "billing_read")
    assert_equal false, body.dig("capabilities", "payment_collection")
    assert body.fetch("notices").any?
    %w[upcoming_appointments intake visit_summaries results medications messages reminders reminder_preferences appointment_requests requests].each do |key|
      refute body.key?(key), "#{key} must not be in the billing-only projection"
    end
    patient = User.find_by!(email_address: "synthetic-patient@example.invalid")
    assert_equal 1, Clinic::PatientPortal::Identity.available.where(user_id: patient.id).count

    get "/api/patient_portal/appointment_requests", headers: @headers
    assert_response :success
    assert response.parsed_body.key?("appointment_requests")
    assert response.parsed_body.key?("options")
    post "/api/patient_portal/appointment_requests", params: {}, headers: local_csrf, as: :json
    assert_response :bad_request
    post "/api/patient_portal/requests", params: {}, headers: local_csrf, as: :json
    assert_response :not_found
    get "/api/patient_portal/reminders", headers: @headers
    assert_response :not_found
    post "/api/patient_portal/reminder_preferences", params: {}, headers: local_csrf, as: :json
    assert_response :not_found
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end

  test "Omni can view any patient in its practice and keeps selection in its session" do
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Development::TestAccounts.prepare!
    omni = User.find_by!(email_address: "omni@test.com")
    additional_patient = omni.clinic_membership.practice.patients.create!(
      display_name: "Patient Outside Seed Prefix", reference: "PATIENT-001"
    )

    post "/api/development_session", params: { profile: "omni" }, headers: local_csrf, as: :json
    assert_response :created
    get "/api/patient_portal/context", headers: @headers
    assert_response :success
    first_context = response.parsed_body
    preview = first_context.fetch("development_preview")
    assert_includes preview.fetch("patients").map { |patient| patient.fetch("id") }, additional_patient.id
    first_patient = preview.fetch("patients").first
    second_patient = preview.fetch("patients").second
    assert_equal first_patient.fetch("id"), preview.fetch("selected_patient_id")

    patch "/api/patient_portal/development_patient", params: { patient_id: second_patient.fetch("id") }, headers: local_csrf, as: :json
    assert_response :success
    assert_equal second_patient.fetch("id"), response.parsed_body.dig("selected_patient", "id")
    get "/api/patient_portal/context", headers: @headers
    assert_equal second_patient.fetch("id"), response.parsed_body.dig("patient", "id")
    assert_equal second_patient.fetch("id"), response.parsed_body.dig("development_preview", "selected_patient_id")

    other = open_session
    other.host! "localhost:3000"
    other_headers = { "Origin" => @origin, "REMOTE_ADDR" => "127.0.0.1" }
    other.get "/api/csrf", headers: other_headers
    other_headers["X-CSRF-Token"] = other.response.parsed_body.fetch("csrf_token")
    other.post "/api/development_session", params: { profile: "omni" }, headers: other_headers, as: :json
    other.get "/api/patient_portal/context", headers: other_headers
    assert_equal first_patient.fetch("id"), other.response.parsed_body.dig("development_preview", "selected_patient_id")

    patch "/api/patient_portal/development_patient", params: { patient_id: "not-an-id" }, headers: local_csrf, as: :json
    assert_response :bad_request
    patch "/api/patient_portal/development_patient", params: { patient_id: "999999999" }, headers: local_csrf, as: :json
    assert_response :not_found
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end

  test "assigned patient cannot use the Omni preview switch" do
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Development::TestAccounts.prepare!
    post "/api/development_session", params: { profile: "patient" }, headers: local_csrf, as: :json
    assert_response :created
    patch "/api/patient_portal/development_patient", params: { patient_id: 1 }, headers: local_csrf, as: :json
    assert_response :not_found
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
