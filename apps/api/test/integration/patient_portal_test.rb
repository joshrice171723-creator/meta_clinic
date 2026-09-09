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
    assert body.dig("billing", "pagination", "invoices").key?("next_cursor")
    assert body.dig("billing", "pagination", "payments").key?("next_cursor")
    assert body.fetch("notices").any?
    %w[upcoming_appointments intake visit_summaries results medications messages reminders reminder_preferences appointment_requests requests].each do |key|
      refute body.key?(key), "#{key} must not be in the billing-only projection"
    end
    patient = User.find_by!(email_address: "synthetic-patient@example.invalid")
    assert_equal 1, Clinic::PatientPortal::Identity.available.where(user_id: patient.id).count

    get "/api/patient_portal/billing_history", params: { kind: "invoices" }, headers: @headers
    assert_response :success
    assert_equal body.dig("patient", "id"), response.parsed_body.fetch("patient_id")
    assert_equal "invoices", response.parsed_body.fetch("kind")

    get "/api/patient_portal/billing_history", params: { kind: "unknown" }, headers: @headers
    assert_response :unprocessable_entity

    get "/api/patient_portal/billing_history", params: { kind: "invoices", before: "not-an-id" }, headers: @headers
    assert_response :bad_request

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

  test "staff provisions a patient account that activates and signs in normally" do
    previous_environment, previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Development::TestAccounts.prepare!
    omni = User.find_by!(email_address: "omni@test.com")
    practice = omni.clinic_membership.practice
    patient = practice.patients.create!(display_name: "Portal Account Patient", reference: "PORTAL-ACCOUNT-001")
    email = "portal-account-#{SecureRandom.hex(6)}@example.invalid"
    patient.contacts.create!(practice: practice, contact_type: "email", contact_value: email,
      preferred: true, effective_from: Time.current)

    post "/api/development_session", params: { profile: "omni" }, headers: local_csrf, as: :json
    assert_response :created
    post "/api/clinic/patient_portal/invitations",
      params: { patient_portal_invitation: { patient_id: patient.id } }, headers: local_csrf, as: :json
    assert_response :created
    invitation = response.parsed_body.fetch("invitation")
    token = CGI.parse(URI.parse(invitation.fetch("activation_path")).fragment).fetch("token").first
    account = User.find_by!(email_address: email)
    assert_not account.active?

    delete "/api/session", headers: local_csrf, as: :json
    post "/api/session", params: { email_address: email, password: "Patient-portal-password-2026!" },
      headers: local_csrf, as: :json
    assert_response :unauthorized

    post "/api/patient_portal/invitation/activate", params: { patient_portal_activation: {
      token: token, password: "Patient-portal-password-2026!",
      password_confirmation: "Patient-portal-password-2026!", accepted_terms: true,
      terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION
    } }, headers: local_csrf, as: :json
    assert_response :created
    delete "/api/session", headers: local_csrf, as: :json

    post "/api/session", params: { email_address: email, password: "Patient-portal-password-2026!" },
      headers: local_csrf, as: :json
    assert_response :success
    get "/api/patient_portal/context", headers: @headers
    assert_response :success
    assert_equal patient.id, response.parsed_body.dig("patient", "id")
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = previous_environment, previous_flag
  end

  test "production portal access follows the enabled pilot practice" do
    practice = Clinic::Practice.create!(name: "Pilot Portal Practice", timezone: "UTC")
    patient = practice.patients.create!(display_name: "Portal Patient", reference: "PILOT-001")
    user = User.create!(email_address: "portal-pilot-#{SecureRandom.hex(6)}@example.invalid",
      password: SecureRandom.hex(20))
    actor = User.create!(email_address: "portal-actor-#{SecureRandom.hex(6)}@example.invalid",
      password: SecureRandom.hex(20))
    invitation = Clinic::PatientPortal::InviteIdentity.call(
      practice: practice, patient: patient, user: user, actor: actor
    )
    payload = {
      patient_portal_activation: {
        token: invitation.fetch(:token), accepted_terms: true,
        password: "Patient-portal-password-2026!",
        password_confirmation: "Patient-portal-password-2026!",
        terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION
      }
    }

    deployed do
      post "/api/patient_portal/invitation/activate", params: payload, headers: local_csrf, as: :json
      assert_response :unprocessable_entity
      assert invitation.fetch(:identity).reload.invited?

      ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] = practice.id.to_s
      post "/api/patient_portal/invitation/activate", params: payload, headers: local_csrf, as: :json
      assert_response :created
      get "/api/patient_portal/context", headers: @headers
      assert_response :success
      assert_equal patient.id, response.parsed_body.dig("patient", "id")
      assert_equal false, response.parsed_body.fetch("development_only")
      assert_equal true, response.parsed_body.dig("capabilities", "password_change")

      patch "/api/patient_portal/account/password", params: { patient_portal_password: {
        current_password: "incorrect-password", password: "Changed-patient-password-2026!",
        password_confirmation: "Changed-patient-password-2026!"
      } }, headers: local_csrf, as: :json
      assert_response :unprocessable_entity

      patch "/api/patient_portal/account/password", params: { patient_portal_password: {
        current_password: "Patient-portal-password-2026!", password: "Changed-patient-password-2026!",
        password_confirmation: "Changed-patient-password-2026!"
      } }, headers: local_csrf, as: :json
      assert_response :success
      delete "/api/session", headers: local_csrf, as: :json
      post "/api/session", params: { email_address: user.email_address,
        password: "Patient-portal-password-2026!" }, headers: local_csrf, as: :json
      assert_response :unauthorized
      post "/api/session", params: { email_address: user.email_address,
        password: "Changed-patient-password-2026!" }, headers: local_csrf, as: :json
      assert_response :success

      ENV.delete("APP_CLINIC_PILOT_PRACTICE_IDS")
      get "/api/patient_portal/context", headers: @headers
      assert_response :not_found
    end
  end

  private

  def deployed
    previous = [ Rails.env, ENV["APP_DEPLOYMENT_ENV"], ENV["APP_DEVELOPMENT_LOGIN"],
      ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] ]
    Rails.env = "production"
    ENV["APP_DEPLOYMENT_ENV"] = "staging"
    ENV["APP_DEVELOPMENT_LOGIN"] = "0"
    ENV.delete("APP_CLINIC_PILOT_PRACTICE_IDS")
    yield
  ensure
    Rails.env, ENV["APP_DEPLOYMENT_ENV"], ENV["APP_DEVELOPMENT_LOGIN"],
      ENV["APP_CLINIC_PILOT_PRACTICE_IDS"] = previous
  end
end
