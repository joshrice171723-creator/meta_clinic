require "test_helper"

class PatientPortalWalkInReturnTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = "Synthetic-staff-password-2026!"
    organization = Organization.create!(name: "Walk-in return organization")
    @practice = Clinic::Practice.create!(name: "Walk-in return practice", organization: organization)
    @other_practice = Clinic::Practice.create!(name: "Other walk-in practice", organization: organization)
    @staff = User.create!(email_address: "walk-in-staff-#{SecureRandom.hex(5)}@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(membership, "patients.read", "patients.write", "patient_portal.identity.invite")
    @reader = User.create!(email_address: "walk-in-reader-#{SecureRandom.hex(5)}@example.invalid", password: @password)
    grant_permissions!(@practice.memberships.create!(user: @reader), "patients.read")
    @other_patient = @other_practice.patients.create!(display_name: "Other practice patient", reference: "OTHER-WALK-IN")
    @email = "walk-in-return-#{SecureRandom.hex(5)}@example.invalid"
  end

  test "walk-in registration retains one patient identity for later portal return and scoped staff review" do
    membership = @practice.memberships.find_by!(user: @staff)
    grant_permissions!(membership, "patients.read", "patients.write", "patient_portal.identity.invite",
      "facilities.read", "facilities.write")
    site = @practice.sites.create!(code: "WALK-IN", status: "active")
    @practice.visit_types.create!(code: "Synthetic walk-in visit")
    Development::GuidedClinicDemo.configure_site_profile!(practice: @practice, site:, membership:,
      clinic_type: "primary_care", request_key: "walk-in-registration-profile", finalize: true)
    login(@staff)
    patch "/api/clinic/context", params: { site_id: site.id }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal site.id, response.parsed_body.dig("current_site", "id")
    assert_equal true, response.parsed_body.dig("current_site", "finalized")
    assert_equal true, response.parsed_body.dig("current_site", "specialty_configured")
    get "/api/clinic/context", headers: @headers
    assert_response :success
    assert_equal site.id, response.parsed_body.dig("current_site", "id")
    assert_equal "primary_care", response.parsed_body.dig("features", "clinic_type")
    assert_equal true, response.parsed_body.dig("features", "finalized")
    post "/api/clinic/patients", params: { clinic_patient: {
      display_name: "Synthetic Walk-in Patient", reference: "WALK-IN-RETURN",
      date_of_birth: "1991-04-12", sex: "unknown", contact_type: "email", contact_value: @email,
      preferred: true, request_key: SecureRandom.uuid
    } }, headers: csrf_headers, as: :json
    assert_response :created
    patient_id = response.parsed_body.fetch("id")
    assert_equal 1, @practice.patients.where(id: patient_id).count

    get "/api/clinic/patients/#{patient_id}", headers: @headers
    assert_response :success
    assert_nil response.parsed_body.fetch("portal_access")

    post "/api/clinic/patient_portal/invitations",
      params: { patient_portal_invitation: { patient_id: patient_id } }, headers: csrf_headers, as: :json
    assert_response :created
    invitation = response.parsed_body.fetch("invitation")
    token = CGI.parse(URI.parse(invitation.fetch("activation_path")).fragment).fetch("token").sole
    identity = Clinic::PatientPortal::Identity.find_by!(practice_id: @practice.id, patient_id: patient_id)
    assert_equal "invited", identity.status

    get "/api/clinic/patients/#{patient_id}", headers: @headers
    assert_response :success
    assert_equal "invited", response.parsed_body.dig("portal_access", "status")
    assert_equal true, response.parsed_body.dig("portal_access", "invitation_open")

    get "/api/clinic/patients/#{@other_patient.id}", headers: @headers
    assert_response :not_found
    post "/api/clinic/patient_portal/invitations",
      params: { patient_portal_invitation: { patient_id: @other_patient.id } }, headers: csrf_headers, as: :json
    assert_response :not_found

    delete "/api/session", headers: csrf_headers, as: :json
    portal_password = "Synthetic-portal-password-2026!"
    post "/api/patient_portal/invitation/activate", params: { patient_portal_activation: {
      token: token, password: portal_password, password_confirmation: portal_password,
      accepted_terms: true, terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION
    } }, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal identity.id, Clinic::PatientPortal::Identity.available.find_by!(patient_id: patient_id).id
    get "/api/patient_portal/context", headers: @headers
    assert_response :success
    assert_equal patient_id, response.parsed_body.dig("patient", "id")
    assert_equal @practice.id, response.parsed_body.dig("practice", "id")

    delete "/api/session", headers: csrf_headers, as: :json
    post "/api/session", params: { email_address: @email, password: portal_password },
      headers: csrf_headers, as: :json
    assert_response :success
    get "/api/patient_portal/context", headers: @headers
    assert_response :success
    assert_equal patient_id, response.parsed_body.dig("patient", "id")
    assert_equal 1, @practice.patients.where(id: patient_id).count

    delete "/api/session", headers: csrf_headers, as: :json
    login(@reader)
    get "/api/clinic/patients/#{patient_id}", headers: @headers
    assert_response :success
    assert_not response.parsed_body.key?("portal_access")
    post "/api/clinic/patient_portal/invitations",
      params: { patient_portal_invitation: { patient_id: patient_id } }, headers: csrf_headers, as: :json
    assert_response :forbidden

    delete "/api/session", headers: csrf_headers, as: :json
    login(@staff)
    get "/api/clinic/patients/#{patient_id}", headers: @headers
    assert_response :success
    assert_equal "active", response.parsed_body.dig("portal_access", "status")
  end

  test "a removed email cannot be used to create portal access" do
    patient = @practice.patients.create!(display_name: "Synthetic Removed Email", reference: "REMOVED-EMAIL")
    patient.contacts.create!(practice: @practice, contact_type: "email", contact_value: @email,
      preferred: true, effective_from: 1.day.ago)
    now = Time.current
    patient.contacts.create!(practice: @practice, contact_type: "email", contact_value: @email,
      preferred: true, effective_from: now - Rational(1, 1_000_000), effective_until: now)
    login(@staff)

    assert_no_difference -> { Clinic::PatientPortal::Identity.count } do
      post "/api/clinic/patient_portal/invitations",
        params: { patient_portal_invitation: { patient_id: patient.id } }, headers: csrf_headers, as: :json
    end

    assert_response :unprocessable_entity
    assert_match "current patient email", response.parsed_body.fetch("error")
  end

  test "portal invitation uses the current email before a future replacement takes effect" do
    patient = @practice.patients.create!(display_name: "Synthetic Future Email", reference: "FUTURE-EMAIL")
    patient.contacts.create!(practice: @practice, contact_type: "email", contact_value: @email,
      preferred: true, effective_from: 1.day.ago)
    patient.contacts.create!(practice: @practice, contact_type: "email", contact_value: "future-#{@email}",
      preferred: false, effective_from: 1.day.from_now)
    login(@staff)

    post "/api/clinic/patient_portal/invitations",
      params: { patient_portal_invitation: { patient_id: patient.id } }, headers: csrf_headers, as: :json

    assert_response :created
    assert_equal @email, response.parsed_body.dig("invitation", "email_address")
  end

  private

  def login(user)
    post "/api/session", params: { email_address: user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
