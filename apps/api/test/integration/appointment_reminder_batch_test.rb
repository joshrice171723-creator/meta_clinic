require "test_helper"

class AppointmentReminderBatchTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Reminder Batch Organization")
    @practice = Clinic::Practice.create!(name: "Cedar Clinic", timezone: "America/Chicago", organization: organization)
    @user = User.create!(email_address: "reminder-batch@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "reminders.read", "reminders.write")
    @site = @practice.sites.create!(code: "BATCH", name: "Batch clinic", status: "active")
    @other_site = @practice.sites.create!(code: "OTHER", name: "Other clinic", status: "active")
    grant_permissions!(@membership, "appointments.read", scope_kind: "site", site: @site)
    login
  end

  test "preview separates eligible inside-24-hour and missing-destination appointments" do
    eligible = appointment_for(eligible_patient("BATCH-READY"), starts_at: 3.days.from_now)
    inside_window = appointment_for(eligible_patient("BATCH-SOON"), starts_at: 12.hours.from_now)
    missing_endpoint = appointment_for(patient_with_consent("BATCH-NO-ENDPOINT"), starts_at: 4.days.from_now)

    post batch_preview_path, params: { appointment_ids: [eligible.id, inside_window.id, missing_endpoint.id] },
      headers: csrf_headers, as: :json

    assert_response :success
    payload = response.parsed_body
    assert_equal 1, payload.fetch("ready_count")
    items = payload.fetch("items").index_by { |item| item.fetch("appointment_id") }
    ready = items.fetch(eligible.id)
    assert_equal "ready", ready.fetch("status")
    assert_equal (eligible.starts_at - 24.hours).iso8601(6), ready.fetch("scheduled_at")
    assert_equal "America/Chicago", ready.fetch("timezone")
    assert_includes ready.fetch("message"), "Cedar Clinic"
    assert_includes ready.fetch("message"), "Reply YA to confirm or NA if you need to reschedule."
    assert_equal 64, ready.fetch("preview_digest").length
    assert_not ready.key?("endpoint_id")
    assert_equal "unavailable", items.fetch(inside_window.id).fetch("status")
    assert_includes items.fetch(inside_window.id).fetch("reason"), "inside 24 hours"
    assert_equal "unavailable", items.fetch(missing_endpoint.id).fetch("status")
    assert_includes items.fetch(missing_endpoint.id).fetch("reason"), "verified text-message destination"
  end

  test "schedule replays without duplicates and a cancellation permits one fresh reminder" do
    appointment = appointment_for(eligible_patient("BATCH-REPLAY"), starts_at: 3.days.from_now)
    first_preview = preview(appointment)

    first = schedule(first_preview)
    assert_equal "scheduled", first.fetch("status")
    reminder = @practice.patient_reminders.find(first.fetch("reminder_id"))
    assert_equal "custom-v1", reminder.safe_content_version
    assert_equal appointment.starts_at, reminder.expires_at
    assert_equal "pending", reminder.outbox.dispatch_state
    assert_empty reminder.delivery_attempts

    replay = schedule(first_preview)
    assert_equal "already_scheduled", replay.fetch("status")
    assert_equal reminder.id, replay.fetch("reminder_id")
    assert_equal 1, appointment_reminders(appointment).count

    post "/api/clinic/reminders/#{reminder.id}/cancel", params: { reason: "Staff canceled this reminder." },
      headers: csrf_headers, as: :json
    assert_response :no_content
    second_preview = preview(appointment)
    assert_equal "ready", second_preview.fetch("status")
    assert_not_equal first_preview.fetch("preview_digest"), second_preview.fetch("preview_digest")

    replacement = schedule(second_preview)
    assert_equal "scheduled", replacement.fetch("status")
    assert_not_equal reminder.id, replacement.fetch("reminder_id")
    assert_equal 2, appointment_reminders(appointment).count
    assert_equal 1, appointment_reminders(appointment).where.not(status: "cancelled").count
  end

  test "appointment and endpoint changes skip stale previews" do
    patient = eligible_patient("BATCH-STALE")
    appointment_changed = appointment_for(patient, starts_at: 3.days.from_now)
    endpoint_changed = appointment_for(patient, starts_at: 4.days.from_now)
    appointment_preview = preview(appointment_changed)
    endpoint_preview = preview(endpoint_changed)

    appointment_changed.update!(starts_at: appointment_changed.starts_at + 1.hour,
      ends_at: appointment_changed.ends_at + 1.hour)
    old_endpoint = patient.communication_endpoints.verified.phone.first
    old_endpoint.update_columns(invalidated_at: Time.current, updated_at: Time.current)
    create_phone_endpoint(patient, "+15005550199")

    post batch_schedule_path, params: { items: [
      appointment_preview.slice("appointment_id", "preview_digest"),
      endpoint_preview.slice("appointment_id", "preview_digest")
    ] }, headers: csrf_headers, as: :json

    assert_response :success
    results = response.parsed_body.fetch("results")
    assert_equal %w[skipped skipped], results.map { |item| item.fetch("status") }
    assert results.all? { |item| item.fetch("reason").include?("changed") }
    assert_empty @practice.patient_reminders
  end

  test "a mixed unauthorized schedule request is rejected before any reminder is created" do
    allowed = appointment_for(eligible_patient("BATCH-ALLOWED"), starts_at: 3.days.from_now)
    blocked = appointment_for(eligible_patient("BATCH-BLOCKED"), starts_at: 4.days.from_now, site: @other_site)
    allowed_preview = preview(allowed)

    post batch_schedule_path, params: { items: [
      allowed_preview.slice("appointment_id", "preview_digest"),
      { appointment_id: blocked.id, preview_digest: "a" * 64 }
    ] }, headers: csrf_headers, as: :json

    assert_response :forbidden
    assert_empty @practice.patient_reminders
  end

  test "Muse 55 reminder configuration persists replay safety and drives current preview scheduling" do
    grant_permissions!(@membership, "roles.manage")
    get "/api/clinic/reminder_policy", headers: @headers
    assert_response :success
    assert_equal 24, response.parsed_body.fetch("policy").fetch("lead_hours")
    appointment = appointment_for(eligible_patient("SYN-POLICY-READY"), starts_at: 5.days.from_now)
    input = { expected_revision: 0, request_key: "synthetic-reminder-policy-1", enabled: true, lead_hours: 48 }
    2.times do
      patch "/api/clinic/reminder_policy", params: { policy: input }, headers: csrf_headers, as: :json
      assert_response :success
      assert_equal 1, response.parsed_body.fetch("policy").fetch("revision")
    end
    assert_equal 1, Clinic::Reminders::PolicyVersion.where(practice: @practice).count
    policy = Clinic::Reminders::PolicyVersion.find_by!(practice: @practice)
    assert_raises(ActiveRecord::RecordNotSaved) { policy.update!(lead_hours: 72) }
    assert_raises(ActiveRecord::RecordNotDestroyed) { policy.destroy! }
    patch "/api/clinic/reminder_policy", params: { policy: input.merge(lead_hours: 72) }, headers: csrf_headers, as: :json
    assert_response :conflict
    patch "/api/clinic/reminder_policy", params: { policy: input.merge(request_key: "synthetic-stale-policy") }, headers: csrf_headers, as: :json
    assert_response :conflict
    get "/api/clinic/reminder_policy", headers: @headers
    assert_response :success
    assert_equal 48, response.parsed_body.fetch("policy").fetch("lead_hours")
    old_preview = preview(appointment)
    assert_equal (appointment.starts_at - 48.hours).iso8601(6), old_preview.fetch("scheduled_at")
    patch "/api/clinic/reminder_policy", params: { policy: input.merge(expected_revision: 1, request_key: "synthetic-reminder-policy-2", lead_hours: 72) }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "skipped", schedule(old_preview).fetch("status")
    assert_empty appointment_reminders(appointment)
    fresh_preview = preview(appointment)
    assert_equal (appointment.starts_at - 72.hours).iso8601(6), fresh_preview.fetch("scheduled_at")
    result = schedule(fresh_preview)
    assert_equal "scheduled", result.fetch("status")
    reminder = @practice.patient_reminders.find(result.fetch("reminder_id"))
    assert_equal (appointment.starts_at - 72.hours).iso8601(6), reminder.scheduled_at.iso8601(6)
    assert_empty reminder.delivery_attempts
    patch "/api/clinic/reminder_policy", params: { policy: input.merge(expected_revision: 2, request_key: "synthetic-reminder-policy-3", enabled: false) }, headers: csrf_headers, as: :json
    assert_response :success
    next_appointment = appointment_for(eligible_patient("SYN-POLICY-DISABLED"), starts_at: 6.days.from_now)
    blocked = preview(next_appointment)
    assert_equal "unavailable", blocked.fetch("status")
    assert_includes blocked.fetch("reason"), "disabled"
    assert_empty appointment_reminders(next_appointment)
    assert_equal "already_scheduled", preview(appointment).fetch("status")
    assert_equal (appointment.starts_at - 72.hours).iso8601(6), reminder.reload.scheduled_at.iso8601(6)
    assert_equal 3, Clinic::Reminders::PolicyVersion.where(practice: @practice).count
    revoke_all_permissions!(@membership)
    get "/api/clinic/reminder_policy", headers: @headers
    assert_response :forbidden
    patch "/api/clinic/reminder_policy", params: { policy: input }, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_equal 3, Clinic::Reminders::PolicyVersion.where(practice: @practice).count
  end

  private

  def eligible_patient(reference)
    patient = patient_with_consent(reference)
    create_phone_endpoint(patient, "+1500555#{format('%04d', patient.id % 10_000)}")
    patient
  end

  def patient_with_consent(reference)
    patient = @practice.patients.create!(display_name: "Patient, #{reference}", reference: reference)
    patient.create_communication_preference!(practice: @practice, preferred_contact_method: "text",
      appointment_reminders_consent: true, general_communications_consent: false)
    patient
  end

  def create_phone_endpoint(patient, value)
    @practice.communication_endpoints.create!(patient: patient, endpoint_type: "phone", label: "Mobile",
      value: value, value_digest: Digest::SHA256.hexdigest(value), verified_at: Time.current)
  end

  def appointment_for(patient, starts_at:, site: @site)
    @practice.appointments.create!(patient: patient, site: site, starts_at: starts_at,
      ends_at: starts_at + 30.minutes, status: "scheduled")
  end

  def preview(appointment)
    post batch_preview_path, params: { appointment_ids: [appointment.id] }, headers: csrf_headers, as: :json
    assert_response :success
    response.parsed_body.fetch("items").sole
  end

  def schedule(item)
    post batch_schedule_path, params: { items: [item.slice("appointment_id", "preview_digest")] },
      headers: csrf_headers, as: :json
    assert_response :success
    response.parsed_body.fetch("results").sole
  end

  def appointment_reminders(appointment)
    @practice.patient_reminders.where(source_type: "Clinic::Appointment", source_id: appointment.id,
      category: "appointment")
  end

  def batch_preview_path
    "/api/clinic/reminders/batch_preview"
  end

  def batch_schedule_path
    "/api/clinic/reminders/batch_schedule"
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def login
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end
end
