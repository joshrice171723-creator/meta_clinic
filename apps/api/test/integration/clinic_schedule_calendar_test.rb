require "test_helper"

class ClinicScheduleCalendarTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(18)
    @user = User.create!(email_address: "calendar-flow@example.invalid", password: password)
    @practice = Clinic::Practice.create!(name: "Synthetic Calendar Flow", organization: Organization.create!(name: "Synthetic Calendar Flow"), timezone: "America/Chicago")
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "appointments.read", "appointments.book", "appointments.status_transition", "encounters.write")
    @site = @practice.sites.create!(code: "CAL")
    @clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Synthetic Calendar Clinician")
    @patient = @practice.patients.create!(display_name: "Synthetic Calendar Patient", reference: "CAL-FLOW")
    @type = @practice.visit_types.create!(code: "Initial visit")
    @date = Date.current.next_month.beginning_of_month
    @start = ActiveSupport::TimeZone[@practice.timezone].local(@date.year, @date.month, @date.day, 9)
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: @date.wday, start_minute: 540, end_minute: 600, active: true)
    post "/api/session", params: { email_address: @user.email_address, password: password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "booking is counted once and enters tracking only on check in" do
    get_calendar
    assert_equal 2, day.fetch("available")
    payload = { appointment: { patient_id: @patient.id, site_id: @site.id, booked_clinician_id: @clinician.id,
      visit_type_id: @type.id, starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601, request_key: SecureRandom.uuid } }
    assert_difference -> { @practice.appointments.count }, 1 do
      2.times do
        post "/api/clinic/appointments", params: payload, headers: csrf_headers, as: :json
        assert_response :created
      end
    end
    appointment_id = response.parsed_body.fetch("appointment").fetch("id")
    get_calendar
    assert_equal 1, day.fetch("scheduled")
    assert_equal 1, day.fetch("available")
    assert_equal @patient.display_name, day.fetch("appointments").first.dig("patient", "display_name")
    get "/api/clinic/tracking_board", headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("visits")
    post "/api/clinic/patients/#{@patient.id}/encounters", params: { encounter: { appointment_id: appointment_id } }, headers: csrf_headers, as: :json
    assert_response :created
    get "/api/clinic/tracking_board", headers: @headers
    assert_response :success
    assert_equal [ @patient.id ], response.parsed_body.fetch("visits").map { |v| v.fetch("patient_id") }
    get_calendar
    assert_equal "checked_in", day.fetch("appointments").first.fetch("calendar_status")
  end

  test "booking rejects a site with no configured capacity" do
    Clinic::Scheduling::CapacityRule.where(practice: @practice, site: @site).delete_all
    payload = { appointment: { patient_id: @patient.id, site_id: @site.id, booked_clinician_id: @clinician.id,
      visit_type_id: @type.id, starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601, request_key: SecureRandom.uuid } }

    assert_no_difference -> { @practice.appointments.count } do
      post "/api/clinic/appointments", params: payload, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
    assert_match "no capacity configured", response.parsed_body.fetch("error")
  end

  test "calendar does not disclose another clinic or allow unprivileged reads" do
    other = Clinic::Practice.create!(name: "Other Synthetic Calendar", organization: Organization.create!(name: "Other Synthetic Calendar"))
    site = other.sites.create!(code: "OTHER")
    get "/api/clinic/schedule_calendar", params: { site_id: site.id, date: @date.iso8601 }, headers: @headers
    assert_response :not_found
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "patients.read")
    get "/api/clinic/schedule_calendar", params: { site_id: @site.id, date: @date.iso8601 }, headers: @headers
    assert_response :forbidden
  end

  test "cancellation requires acknowledgement and records its causal transition id" do
    payload = { appointment: { patient_id: @patient.id, site_id: @site.id, booked_clinician_id: @clinician.id,
      visit_type_id: @type.id, starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601, request_key: SecureRandom.uuid } }
    post "/api/clinic/appointments", params: payload, headers: csrf_headers, as: :json
    assert_response :created
    appointment = @practice.appointments.find(response.parsed_body.fetch("appointment").fetch("id"))

    post "/api/clinic/appointments/#{appointment.id}/transition",
      params: { transition: { to: "cancelled", expected_status: "scheduled" } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "scheduled", appointment.reload.status

    post "/api/clinic/appointments/#{appointment.id}/transition",
      params: { transition: { to: "cancelled", expected_status: "scheduled", cancellation_message_acknowledged: true } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal({ "from" => "scheduled", "to" => "cancelled" }, response.parsed_body.fetch("transition").slice("from", "to"))
    assert Clinic::ModelVersion.where(
      item_type: "Clinic::Appointment", item_id: appointment.id,
      causal_id: "appointment-status-transition:#{appointment.id}:scheduled->cancelled"
    ).exists?
  end

  private

  def get_calendar
    get "/api/clinic/schedule_calendar", params: { site_id: @site.id, date: @date.iso8601 }, headers: @headers
    assert_response :success
  end

  def day
    response.parsed_body.fetch("days").find { |d| d.fetch("date") == @date.iso8601 }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
