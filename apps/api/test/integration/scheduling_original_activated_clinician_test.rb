require "test_helper"

class SchedulingOriginalActivatedClinicianTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 1, 8)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic activated clinician organization")
    @practice = Clinic::Practice.create!(name: "Synthetic activated clinician practice", organization: organization, timezone: "UTC")
    @site = @practice.sites.create!(code: "SYN-ACTIVATED", status: "active")
    @manager = User.create!(email_address: "synthetic-clinician-manager@example.invalid", password: @password)
    manager_membership = @practice.memberships.create!(user: @manager)
    Clinic::Authorization::PilotRoleCatalog.install!
    @clinician_role = RoleVersion.find_by!(role_code: "clinician", version: Clinic::Authorization::PilotRoleCatalog::VERSION)
    grant_permissions!(manager_membership, "roles.manage", "workforce.admin", "facilities.write",
      "patients.identity.read", *@clinician_role.permissions.pluck(:action_code))
    @patient = @practice.patients.create!(display_name: "Synthetic Activated Clinician Patient", reference: "SYN-31-PATIENT")
    @visit_type = @practice.visit_types.create!(code: "SYN-ACTIVATED-VISIT")
  end

  test "Muse31 activated authorized clinician becomes bookable through explicit scheduling setup" do
    invitation = Clinic::Workforce::EmployeeOnboarding.invite!(practice: @practice,
      email_address: "synthetic-activated-clinician@example.invalid", site_ids: [ @site.id ],
      effective_from: Time.current, actor: @manager, role_version: @clinician_role,
      display_name: "Synthetic Activated Clinician", job_title: "Clinician")
    activation_password = SecureRandom.hex(18)
    post "/api/employee_activation", params: { employee_activation: {
      token: invitation.fetch(:token), password: activation_password,
      password_confirmation: activation_password
    } }, headers: csrf_headers, as: :json
    assert_response :created
    assert invitation.fetch(:invitation).reload.activated?
    clinician_user = User.find_by!(email_address: "synthetic-activated-clinician@example.invalid")
    membership = @practice.memberships.find_by!(user: clinician_user)
    assert membership.active?
    assert Ability.new(clinician_user, practice: @practice).allowed_permission?("notes.sign", site: @site)
    assert_not @practice.clinician_profiles.exists?(membership: membership)

    post "/api/session", params: { email_address: @manager.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/clinicians", params: { site_id: @site.id }, headers: @headers
    assert_response :success
    assert_not_includes response.parsed_body.fetch("clinicians").pluck("membership_id"), membership.id
    get "/api/clinic/clinicians", params: { setup: true }, headers: @headers
    assert_response :success
    assert_includes response.parsed_body.fetch("candidates").pluck("membership_id"), membership.id

    post "/api/clinic/clinicians", params: { clinician: {
      membership_id: membership.id, site_id: @site.id,
      display_name: "Synthetic Activated Clinician", department: "Synthetic primary care"
    } }, headers: csrf_headers, as: :json
    assert_response :created
    profile_id = response.parsed_body.fetch("clinician").fetch("id")
    profile = @practice.clinician_profiles.find(profile_id)
    assert_equal membership.id, profile.membership_id
    assert profile.assignments.current.where(site: @site).exists?
    get "/api/clinic/clinicians", params: { site_id: @site.id }, headers: @headers
    assert_response :success
    offered = response.parsed_body.fetch("clinicians").find { |row| row.fetch("id") == profile_id }
    assert_not_nil offered
    assert_equal "Synthetic Activated Clinician", offered.fetch("display_name")

    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: profile,
      kind: "weekly", weekday: 4, start_minute: 0, end_minute: 1440, active: true)
    post "/api/clinic/appointments", params: { appointment: {
      patient_id: @patient.id, site_id: @site.id, booked_clinician_id: profile_id,
      visit_type_id: @visit_type.id, starts_at: "2026-10-01T09:00:00Z",
      ends_at: "2026-10-01T09:30:00Z", request_key: "synthetic-activated-clinician-booking"
    } }, headers: csrf_headers, as: :json
    assert_response :created
    appointment_id = response.parsed_body.fetch("appointment").fetch("id")
    assert_equal profile_id, @practice.appointments.find(appointment_id).reload.booked_clinician_id
    get "/api/clinic/appointments/#{appointment_id}", headers: @headers
    assert_response :success
    assert_equal profile_id, response.parsed_body.fetch("appointment").fetch("booked_clinician_id")
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
