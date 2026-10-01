require "test_helper"

class SchedulingCapacityBoundariesTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @practice = Clinic::Practice.create!(name: "Synthetic capacity boundaries", timezone: "UTC",
      organization: Organization.create!(name: "Synthetic capacity boundaries"))
    @user = User.create!(email_address: "capacity-boundaries@example.invalid", password: @password)
    membership = @practice.memberships.create!(user: @user)
    grant_permissions!(membership, "appointments.book", "appointments.read", "facilities.write", "notes.sign")
    @site = @practice.sites.create!(code: "BOUNDARY", status: "active")
    @room = @practice.rooms.create!(site: @site, code: "BOUNDARY-ROOM", kind: "physical")
    @clinician = @practice.clinician_profiles.create!(membership: membership, display_name: "Synthetic capacity clinician")
    @patient = @practice.patients.create!(display_name: "Synthetic capacity patient", reference: "BOUNDARY-PATIENT")
    @visit_type = @practice.visit_types.create!(code: "BOUNDARY-VISIT")
    @rule = Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: 4, start_minute: 0, end_minute: 1440, active: true)
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "Muse 137 weekly capacity does not replace a clinician assignment for the requested interval" do
    assign_other_site
    payload = booking("2026-10-01T09:00:00Z", "2026-10-01T09:30:00Z", "capacity-is-not-assignment")
    assert_no_difference -> { @practice.appointments.count } do
      submit_booking(payload)
      assert_response :unprocessable_entity
      assert_equal "The clinician is not assigned to this site for the selected time.", response.parsed_body.fetch("error")
    end
    assert_no_difference -> { Clinic::Scheduling::CapacityRule.where(practice: @practice).count } do
      assign_slot(payload)
      assert_response :created
    end
    assert_difference -> { @practice.appointments.count }, 1 do
      submit_booking(payload)
      assert_response :created
    end
    assert_no_difference -> { @practice.appointments.count } do
      submit_booking(booking("2026-10-01T10:00:00Z", "2026-10-01T10:30:00Z", "outside-assignment"))
      assert_response :unprocessable_entity
      assert_equal "The clinician is not assigned to this site for the selected time.", response.parsed_body.fetch("error")
    end
  end

  test "Muse 222 slot assignment does not fabricate capacity and a configured retry keeps the exact booking time" do
    assign_other_site
    @rule.update!(active: false)
    payload = booking("2026-10-01T09:00:00Z", "2026-10-01T09:30:00Z", "assignment-needs-capacity")
    assert_no_difference -> { @practice.appointments.count } do
      assign_slot(payload)
      assert_response :created
      submit_booking(payload)
      assert_response :unprocessable_entity
      assert_equal "The clinician has no capacity configured for this site.", response.parsed_body.fetch("error")
    end
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, operation_code: "appointments.book",
      request_key: payload.fetch(:appointment).fetch(:request_key))
    @rule.update!(active: true)
    assert_difference -> { @practice.appointments.count }, 1 do
      submit_booking(payload)
      assert_response :created
    end
    id = response.parsed_body.fetch("appointment").fetch("id")
    assert_readback(id, "2026-10-01T09:00:00Z", "2026-10-01T09:30:00Z")
  end

  test "Muse 209 operating hours use the selected site timezone for the reported UTC inputs" do
    @site.update!(timezone_override: "America/Chicago")
    @site.operating_hours.create!(practice: @practice, day_of_week: 4,
      open_time: "08:00", close_time: "17:30", closed: false)
    [ [ "02:52", "03:22" ], [ "03:00", "03:30" ], [ "10:30", "11:00" ] ].each_with_index do |(starts, ends), index|
      assert_no_difference [ -> { @practice.appointments.count }, -> { Clinic::OperationReceipt.count } ] do
        submit_booking(booking("2026-10-01T#{starts}:00Z", "2026-10-01T#{ends}:00Z", "outside-hours-#{index}"))
        assert_response :unprocessable_entity
        assert_equal "This time is outside the site's operating hours.", response.parsed_body.fetch("error")
      end
    end
    assert_difference -> { @practice.appointments.count }, 1 do
      submit_booking(booking("2026-10-01T14:00:00Z", "2026-10-01T14:30:00Z", "inside-hours"))
      assert_response :created
    end
    assert_readback(response.parsed_body.fetch("appointment").fetch("id"), "2026-10-01T14:00:00Z", "2026-10-01T14:30:00Z")
  end

  test "Muse 151 cancelled overlap releases clinician patient and room but active overlap still blocks" do
    prior = @practice.appointments.create!(patient: @patient, site: @site, room: @room, booked_clinician: @clinician,
      visit_type: @visit_type, starts_at: Time.iso8601("2026-10-01T09:00:00Z"),
      ends_at: Time.iso8601("2026-10-01T09:30:00Z"), status: "cancelled")
    assert_difference -> { @practice.appointments.count }, 1 do
      submit_booking(booking("2026-10-01T09:00:00Z", "2026-10-01T09:30:00Z", "reuse-cancelled-slot"))
      assert_response :created
    end
    id = response.parsed_body.fetch("appointment").fetch("id")
    assert_not_equal prior.id, id
    assert_readback(id, "2026-10-01T09:00:00Z", "2026-10-01T09:30:00Z")
    assert_equal "cancelled", prior.reload.status
    assert_no_difference -> { @practice.appointments.count } do
      submit_booking(booking("2026-10-01T09:15:00Z", "2026-10-01T09:45:00Z", "active-overlap"))
      assert_response :unprocessable_entity
      assert_equal "This clinician is already booked for that time.", response.parsed_body.fetch("error")
    end
    assert_difference -> { @practice.appointments.count }, 1 do
      submit_booking(booking("2026-10-01T09:30:00Z", "2026-10-01T10:00:00Z", "same-day-no-overlap"))
      assert_response :created
    end
  end

  test "Muse 136 unnamed clinician options and calendar readback retain the assigned profile" do
    @clinician.update!(display_name: nil, reference: nil)
    get "/api/clinic/waitlist", headers: @headers
    assert_response :success
    option = response.parsed_body.fetch("clinicians").find { |row| row.fetch("id") == @clinician.id }
    assert_equal "Clinician profile ##{@clinician.id}", option.fetch("name")
    @clinician.update!(reference: "SYN-CLINICIAN")
    get "/api/clinic/waitlist", headers: @headers
    assert_response :success
    option = response.parsed_body.fetch("clinicians").find { |row| row.fetch("id") == @clinician.id }
    assert_equal "SYN-CLINICIAN", option.fetch("name")
    @clinician.update!(reference: nil)
    submit_booking(booking("2026-10-01T09:00:00Z", "2026-10-01T09:30:00Z", "unnamed-profile-readback"))
    assert_response :created
    id = response.parsed_body.fetch("appointment").fetch("id")
    get "/api/clinic/schedule_calendar", params: { site_id: @site.id, date: "2026-10-01" }, headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("days").flat_map { |day| day.fetch("appointments") }.find { |item| item.fetch("id") == id }
    assert_equal @clinician.id, row.fetch("booked_clinician_id")
    assert_equal "Clinician profile ##{@clinician.id}", row.fetch("clinician_name")
  end

  private

  def assign_other_site
    department = @practice.departments.create!(code: "BOUNDARY-DEPT")
    @clinician.assignments.create!(practice: @practice, site: @practice.sites.create!(code: "OTHER"),
      department: department, effective_from: Time.iso8601("2026-01-01T00:00:00Z"))
  end

  def booking(starts_at, ends_at, request_key)
    { appointment: { patient_id: @patient.id, site_id: @site.id, room_id: @room.id,
      booked_clinician_id: @clinician.id, visit_type_id: @visit_type.id, starts_at: starts_at,
      ends_at: ends_at, request_key: request_key } }
  end

  def assign_slot(payload)
    input = payload.fetch(:appointment)
    post "/api/clinic/clinicians/#{@clinician.id}/assign_site", params: { assignment: {
      site_id: @site.id, starts_at: input.fetch(:starts_at), ends_at: input.fetch(:ends_at)
    } }, headers: csrf_headers, as: :json
  end

  def submit_booking(payload)
    post "/api/clinic/appointments", params: payload, headers: csrf_headers, as: :json
  end

  def assert_readback(id, starts_at, ends_at)
    get "/api/clinic/appointments/#{id}", headers: @headers
    assert_response :success
    row = response.parsed_body.fetch("appointment")
    assert_equal @patient.id, row.fetch("patient_id")
    assert_equal @site.id, row.fetch("site_id")
    assert_equal "scheduled", row.fetch("status")
    assert_equal Time.iso8601(starts_at), Time.iso8601(row.fetch("starts_at"))
    assert_equal Time.iso8601(ends_at), Time.iso8601(row.fetch("ends_at"))
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
