require "test_helper"

class PatientPortalAppointmentConfirmationTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment, @previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }

    Development::TestAccounts.prepare!
    @portal_user = User.find_by!(email_address: "synthetic-patient@example.invalid")
    @identity = Clinic::PatientPortal::Identity.available.find_by!(user: @portal_user)
    @practice = @identity.practice
    @patient = @practice.patients.create!(display_name: "Confirmation Patient", reference: "CONFIRMATION")
    @identity.update!(patient: @patient)
    @site = @practice.sites.create!(code: "CONFIRMATION", name: "Confirmation Site")
    @other_site = @practice.sites.create!(code: "CONFIRMATION-OTHER", name: "Other Confirmation Site")

    post "/api/development_session", params: { profile: "patient" }, headers: csrf_headers, as: :json
    assert_response :created
  end

  teardown do
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = @previous_environment, @previous_flag
  end

  test "owner confirms the exact scheduled appointment and an identical replay is side effect free" do
    appointment = create_appointment(starts_at: 3.days.from_now.change(usec: 0))

    row = upcoming_row(appointment)
    assert_equal true, row.fetch("can_confirm")
    version = row.fetch("confirmation_version")
    assert_match(/\Av1:[0-9a-f]{64}\z/, version)

    put confirmation_path(appointment), params: { confirmation: { version: version } },
      headers: csrf_headers, as: :json
    assert_response :success
    confirmed = response.parsed_body.fetch("appointment")
    assert_equal "confirmed", confirmed.fetch("status")
    assert_equal false, confirmed.fetch("can_confirm")
    assert_equal version, confirmed.fetch("confirmation_version")
    assert_equal "confirmed", appointment.reload.status
    assert_equal 1, confirmation_audits.count

    put confirmation_path(appointment), params: { confirmation: { version: version } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "confirmed", response.parsed_body.dig("appointment", "status")
    assert_equal version, response.parsed_body.dig("appointment", "confirmation_version")
    assert_equal 1, confirmation_audits.count
  end

  test "changed schedule or location invalidates a previously issued version" do
    moved = create_appointment(starts_at: 4.days.from_now.change(usec: 0))
    moved_version = upcoming_row(moved).fetch("confirmation_version")
    moved.update!(starts_at: moved.starts_at + 1.hour, ends_at: moved.ends_at + 1.hour)

    put confirmation_path(moved), params: { confirmation: { version: moved_version } },
      headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "reload_required", response.parsed_body.fetch("code")
    assert_equal "scheduled", moved.reload.status

    relocated = create_appointment(starts_at: 5.days.from_now.change(usec: 0))
    relocated_version = upcoming_row(relocated).fetch("confirmation_version")
    relocated.update!(site: @other_site)

    put confirmation_path(relocated), params: { confirmation: { version: relocated_version } },
      headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "reload_required", response.parsed_body.fetch("code")
    assert_equal "scheduled", relocated.reload.status
    assert_empty confirmation_audits
  end

  test "started pending past and terminal appointments cannot be confirmed" do
    started = create_appointment(starts_at: 3.days.from_now.change(usec: 0))
    pending = create_appointment(starts_at: 4.days.from_now.change(usec: 0))
    terminal = create_appointment(starts_at: 5.days.from_now.change(usec: 0))
    past = create_appointment(starts_at: 30.minutes.from_now.change(usec: 0))
    versions = [started, pending, terminal, past].to_h do |appointment|
      [appointment.id, upcoming_row(appointment).fetch("confirmation_version")]
    end

    @practice.encounters.create!(
      patient: @patient,
      appointment: started,
      site: @site,
      started_at: Time.current,
      status: "open"
    )
    create_pending_change(pending)
    terminal.update!(status: "cancelled")

    [started, pending, terminal].each do |appointment|
      put confirmation_path(appointment), params: {
        confirmation: { version: versions.fetch(appointment.id) }
      }, headers: csrf_headers, as: :json
      assert_response :conflict
      assert_equal "stale_record", response.parsed_body.fetch("code")
    end

    travel_to(past.starts_at + 1.minute) do
      post "/api/development_session", params: { profile: "patient" }, headers: csrf_headers, as: :json
      assert_response :created
      put confirmation_path(past), params: {
        confirmation: { version: versions.fetch(past.id) }
      }, headers: csrf_headers, as: :json
      assert_response :conflict
      assert_equal "stale_record", response.parsed_body.fetch("code")
    end

    get "/api/patient_portal/appointment_requests", headers: @headers
    assert_response :success
    rows = response.parsed_body.fetch("upcoming_appointments").index_by { |row| row.fetch("id") }
    assert_equal false, rows.fetch(started.id).fetch("can_confirm")
    assert_nil rows.fetch(started.id).fetch("confirmation_version")
    assert_equal false, rows.fetch(pending.id).fetch("can_confirm")
    assert_nil rows.fetch(pending.id).fetch("confirmation_version")
    assert_empty confirmation_audits
  end

  test "incomplete appointments are not confirmable through the patient portal" do
    appointment = create_appointment(starts_at: 3.days.from_now.change(usec: 0))
    appointment.update_columns(booked_clinician_id: nil, visit_type_id: nil)

    row = upcoming_row(appointment)
    assert_equal false, row.fetch("can_confirm")
    assert_nil row.fetch("confirmation_version")
    assert_empty confirmation_audits
  end

  test "portal ownership and active identity scope the confirmation endpoint" do
    owned = create_appointment(starts_at: 3.days.from_now.change(usec: 0))
    owned_version = upcoming_row(owned).fetch("confirmation_version")
    other_patient = @practice.patients.create!(display_name: "Other Owner", reference: "CONFIRMATION-OTHER")
    other_appointment = create_appointment(patient: other_patient, starts_at: 4.days.from_now.change(usec: 0))

    put confirmation_path(other_appointment), params: {
      confirmation: { version: Clinic::PatientPortal::AppointmentConfirmation.material_version(other_appointment) }
    }, headers: csrf_headers, as: :json
    assert_response :not_found

    foreign_practice = Clinic::Practice.create!(
      name: "Foreign Confirmation Practice",
      organization: @practice.organization
    )
    foreign_patient = foreign_practice.patients.create!(display_name: "Foreign Owner", reference: "FOREIGN-CONFIRM")
    foreign_site = foreign_practice.sites.create!(code: "FOREIGN-CONFIRM")
    foreign_appointment = foreign_practice.appointments.create!(
      patient: foreign_patient,
      site: foreign_site,
      starts_at: 5.days.from_now,
      ends_at: 5.days.from_now + 30.minutes,
      status: "scheduled"
    )
    put confirmation_path(foreign_appointment), params: {
      confirmation: { version: Clinic::PatientPortal::AppointmentConfirmation.material_version(foreign_appointment) }
    }, headers: csrf_headers, as: :json
    assert_response :not_found

    @identity.update!(status: :revoked, revoked_at: Time.current)
    put confirmation_path(owned), params: { confirmation: { version: owned_version } },
      headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal "scheduled", owned.reload.status
    assert_empty confirmation_audits
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def create_appointment(patient: @patient, starts_at:, status: "scheduled")
    @practice.appointments.create!(
      patient: patient,
      site: @site,
      starts_at: starts_at,
      ends_at: starts_at + 30.minutes,
      status: status
    )
  end

  def upcoming_row(appointment)
    get "/api/patient_portal/appointment_requests", headers: @headers
    assert_response :success
    response.parsed_body.fetch("upcoming_appointments").find do |row|
      row.fetch("id") == appointment.id
    end || flunk("Expected appointment #{appointment.id} in the upcoming portal list")
  end

  def create_pending_change(appointment)
    Clinic::PatientPortal::AppointmentRequest.create!(
      practice: @practice,
      patient: @patient,
      identity: @identity,
      request_key: "pending-confirmation-#{appointment.id}",
      request_kind: "cancel",
      source_appointment: appointment,
      source_appointment_updated_at: appointment.updated_at,
      source_starts_at: appointment.starts_at,
      source_ends_at: appointment.ends_at,
      source_site: appointment.site,
      source_status: appointment.status,
      requested_at: Current.business_time,
      status: "pending"
    )
  end

  def confirmation_audits
    @practice.audit_events.where(
      action_code: "patient_portal.appointment.confirm",
      outcome: "committed"
    )
  end

  def confirmation_path(appointment)
    "/api/patient_portal/appointments/#{appointment.id}/confirmation"
  end
end
