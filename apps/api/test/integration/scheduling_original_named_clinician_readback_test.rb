require "test_helper"

class SchedulingOriginalNamedClinicianReadbackTest < ActionDispatch::IntegrationTest
  setup do
    travel_to Time.utc(2026, 10, 1, 8)
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic named readback organization")
    @practice = Clinic::Practice.create!(name: "Synthetic named readback practice", organization: organization, timezone: "UTC")
    @user = User.create!(email_address: "synthetic-named-readback@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: @user)
    grant_permissions!(membership, "appointments.book", "appointments.read", "patients.identity.read", "notes.sign")
    @site = @practice.sites.create!(code: "SYN-NAMED", status: "active")
    configure_site!(@site, membership: membership)
    department = @practice.departments.create!(code: "SYN-NAMED-DEPT")
    @clinician = @practice.clinician_profiles.create!(membership: membership, display_name: "Synthetic Named Readback Clinician")
    @clinician.assignments.create!(practice: @practice, site: @site, department: department,
      effective_from: Time.utc(2026, 1, 1))
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: 4, start_minute: 0, end_minute: 1440, active: true)
    @patient = @practice.patients.create!(display_name: "Synthetic Named Readback Patient", reference: "SYN-136-PATIENT")
    @visit_type = @practice.visit_types.create!(code: "SYN-NAMED-VISIT")
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  test "Muse 136 named clinician POST GET and calendar readback preserve the selected profile identity" do
    get "/api/clinic/clinicians", headers: @headers
    assert_response :success
    option = response.parsed_body.fetch("clinicians").find { |row| row.fetch("id") == @clinician.id }
    assert_not_nil option
    assert_equal "Synthetic Named Readback Clinician", option.fetch("display_name")

    payload = { appointment: {
      patient_id: @patient.id, site_id: @site.id, booked_clinician_id: option.fetch("id"),
      visit_type_id: @visit_type.id, starts_at: "2026-10-01T09:00:00Z",
      ends_at: "2026-10-01T09:30:00Z", request_key: "synthetic-named-clinician-readback"
    } }
    assert_difference -> { @practice.appointments.count }, 1 do
      post "/api/clinic/appointments", params: payload, headers: csrf_headers, as: :json
      assert_response :created
    end
    created = response.parsed_body.fetch("appointment")
    id = created.fetch("id")
    assert_equal @clinician.id, created.fetch("booked_clinician_id")
    assert_equal @patient.id, created.fetch("patient_id")
    assert_equal @site.id, created.fetch("site_id")
    assert_equal @clinician.id, @practice.appointments.find(id).reload.booked_clinician_id

    get "/api/clinic/appointments/#{id}", headers: @headers
    assert_response :success
    readback = response.parsed_body.fetch("appointment")
    assert_equal id, readback.fetch("id")
    assert_equal @clinician.id, readback.fetch("booked_clinician_id")
    assert_equal @patient.id, readback.fetch("patient_id")
    assert_equal @site.id, readback.fetch("site_id")
    assert_equal Time.utc(2026, 10, 1, 9), Time.iso8601(readback.fetch("starts_at"))

    2.times do
      get "/api/clinic/schedule_calendar", params: { site_id: @site.id, date: "2026-10-01" }, headers: @headers
      assert_response :success
      row = response.parsed_body.fetch("days").flat_map { |day| day.fetch("appointments") }.find { |item| item.fetch("id") == id }
      assert_not_nil row
      assert_equal @clinician.id, row.fetch("booked_clinician_id")
      assert_equal "Synthetic Named Readback Clinician", row.fetch("clinician_name")
      assert_equal @patient.id, row.fetch("patient").fetch("id")
    end
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
