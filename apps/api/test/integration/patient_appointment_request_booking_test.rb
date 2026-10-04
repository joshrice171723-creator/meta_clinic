require "test_helper"

class PatientAppointmentRequestBookingTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    @previous_environment, @previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    organization = Organization.create!(name: "Appointment Request Review Organization")
    @practice = Clinic::Practice.create!(name: "Appointment Request Review Practice", organization: organization)

    @patient_password = Development::TestAccounts.send(:password_for, "patient")
    @patient_user = User.create!(
      email_address: Development::TestAccounts::PROFILES.fetch("patient").fetch(:email),
      password: @patient_password
    )
    @patient = @practice.patients.create!(display_name: "Appointment Patient", reference: "APPOINTMENT-REQUEST-001")
    @identity = Clinic::PatientPortal::Identity.create!(
      practice: @practice,
      patient: @patient,
      user: @patient_user,
      status: :active,
      invited_at: 1.day.ago,
      activated_at: 1.day.ago
    )

    @staff_password = SecureRandom.hex(18)
    @staff_user = User.create!(email_address: "appointment-reviewer@example.invalid", password: @staff_password)
    @staff_membership = @practice.memberships.create!(user: @staff_user)
    @commercial_membership = @patient.patient_memberships.create!(practice: @practice,
      recorded_by_membership: @staff_membership, status: "member", version: 1, effective_from: 1.day.ago)
    grant_permissions!(@staff_membership, "appointments.read", "appointments.book", "appointments.status_transition")

    @site = create_site(@practice, "REQUEST-SITE")
    @other_site = create_site(@practice, "OTHER-REQUEST-SITE")
    @visit_type = @practice.visit_types.create!(code: "REQUEST-VISIT")
    configure_site!(@site, membership: @staff_membership, services: %w[telehealth])
    configure_site!(@other_site, membership: @staff_membership, services: %w[telehealth])
    @retired_visit_type = @practice.visit_types.create!(code: "RETIRED-VISIT", retired_at: Time.current)
    @room = @practice.rooms.create!(site: @site, code: "REQUEST-ROOM")
    clinician_membership = create_membership(@practice, "appointment-clinician@example.invalid")
    @clinician = @practice.clinician_profiles.create!(
      membership: clinician_membership,
      display_name: "Appointment Clinician",
      reference: "APPT-CLINICIAN"
    )
    7.times do |weekday|
      Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
        kind: "weekly", weekday:, start_minute: 0, end_minute: 1440, active: true)
    end

    @patient_session, @patient_headers = authenticated_session(@patient_user, @patient_password, profile: "patient")
    @staff_session, @staff_headers = authenticated_session(@staff_user, @staff_password)
  end

  teardown do
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = @previous_environment, @previous_flag
  end

  test "patient can create and list only its appointment requests with safe options" do
    get_patient_requests
    assert_equal [ @site.id, @other_site.id ].sort,
      @patient_session.response.parsed_body.dig("options", "sites").map { |site| site.fetch("id") }.sort
    assert_equal [ @visit_type.id ],
      @patient_session.response.parsed_body.dig("options", "visit_types").map { |visit_type| visit_type.fetch("id") }

    starts_at = 2.days.from_now.change(usec: 0)
    ends_at = starts_at + 1.hour
    payload = patient_request_payload("patient-window", starts_at, ends_at)
    @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json

    assert_equal 201, @patient_session.response.status
    created = @patient_session.response.parsed_body.fetch("appointment_request")
    assert_equal "pending", created.fetch("status")
    assert_equal "new_booking", created.fetch("request_kind")
    assert_nil created.fetch("source_appointment")
    assert_equal @site.id, created.dig("site", "id")
    assert_nil created.fetch("appointment")

    @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
    assert_equal 200, @patient_session.response.status
    assert_equal created.fetch("id"), @patient_session.response.parsed_body.dig("appointment_request", "id")

    travel_to(starts_at + 1.minute) do
      replay_session, replay_headers = authenticated_session(@patient_user, @patient_password, profile: "patient")
      replay_session.post patient_requests_path, params: payload, headers: replay_headers, as: :json
      assert_equal 200, replay_session.response.status
      assert_equal created.fetch("id"), replay_session.response.parsed_body.dig("appointment_request", "id")
    end

    other_patient = @practice.patients.create!(display_name: "Other Appointment Patient", reference: "APPOINTMENT-REQUEST-002")
    other_user = User.create!(email_address: "other-portal-user@example.invalid", password: SecureRandom.hex(18))
    other_identity = Clinic::PatientPortal::Identity.create!(
      practice: @practice, patient: other_patient, user: other_user, status: :active,
      invited_at: 1.day.ago, activated_at: 1.day.ago
    )
    create_request(patient: other_patient, identity: other_identity, key: "other-patient-window", site: @site)

    get_patient_requests
    assert_equal [ created.fetch("id") ],
      @patient_session.response.parsed_body.fetch("appointment_requests").map { |request| request.fetch("id") }
  end

  test "an existing return request replays after membership changes without completing prior follow-up" do
    grant_permissions!(@staff_membership, "patients.read", "encounters.write")
    encounter = @practice.encounters.create!(patient: @patient, site: @site,
      started_at: 2.days.ago, ended_at: 2.days.ago + 1.hour, status: "completed")
    follow_up = Clinic::EncounterFollowUp.create!(practice: @practice, patient: @patient, encounter: encounter,
      source_kind: "in_person", state: "needed", plan: "Synthetic outstanding return follow-up", outcome: "",
      assigned_to_membership: @staff_membership,
      recorded_by_membership: @staff_membership, updated_by_membership: @staff_membership)
    starts_at = 2.days.from_now.change(usec: 0)
    payload = patient_request_payload("return-before-membership-change", starts_at, starts_at + 1.hour)
    @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
    assert_equal 201, @patient_session.response.status
    request_id = @patient_session.response.parsed_body.dig("appointment_request", "id")

    @patient.patient_memberships.create!(practice: @practice, recorded_by_membership: @staff_membership,
      status: "nonmember", version: 2, effective_from: 1.minute.ago)
    get_patient_requests
    assert_equal false, @patient_session.response.parsed_body.dig("options", "can_request_new_booking")
    original_follow_up = follow_up.attributes
    original_encounter = encounter.attributes
    assert_no_difference "Clinic::PatientPortal::AppointmentRequest.count" do
      assert_no_difference "Clinic::Appointment.count" do
        @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
        assert_equal 200, @patient_session.response.status
        assert_equal request_id, @patient_session.response.parsed_body.dig("appointment_request", "id")
        assert_equal "pending", @patient_session.response.parsed_body.dig("appointment_request", "status")
        assert_nil @patient_session.response.parsed_body.dig("appointment_request", "appointment")
      end
    end
    assert_equal original_follow_up, follow_up.reload.attributes
    assert_equal original_encounter, encounter.reload.attributes

    @patient_session.post patient_requests_path,
      params: patient_request_payload("fresh-return-after-membership-change", starts_at, starts_at + 1.hour),
      headers: @patient_headers, as: :json
    assert_equal 422, @patient_session.response.status
    assert_equal 1, @practice.patient_portal_appointment_requests.where(request_key: "return-before-membership-change").count
    assert_equal "needed", follow_up.reload.state

    other_patient = @practice.patients.create!(display_name: "Synthetic Return Patient B", reference: "RETURN-B")
    other_password = SecureRandom.hex(18)
    other_user = User.create!(email_address: "synthetic-return-b@example.invalid", password: other_password)
    Clinic::PatientPortal::Identity.create!(practice: @practice, patient: other_patient, user: other_user,
      status: :active, invited_at: 1.day.ago, activated_at: 1.day.ago)
    other_session, other_headers = authenticated_session(other_user, other_password)
    other_session.post patient_requests_path, params: payload, headers: other_headers, as: :json
    assert_equal 409, other_session.response.status
    assert_not other_session.response.parsed_body.key?("appointment_request")
    assert_equal original_follow_up, follow_up.reload.attributes
  end

  test "inactive membership blocks new booking while callback and existing visit cancellation remain available" do
    @patient.patient_memberships.create!(practice: @practice, recorded_by_membership: @staff_membership,
      status: "nonmember", version: 2, effective_from: 1.minute.ago)
    get_patient_requests
    assert_equal false, @patient_session.response.parsed_body.dig("options", "can_request_new_booking")
    starts_at = 2.days.from_now.change(usec: 0)
    @patient_session.post patient_requests_path,
      params: patient_request_payload("inactive-denied", starts_at, starts_at + 1.hour), headers: @patient_headers, as: :json
    assert_equal 422, @patient_session.response.status
    callback = { patient_portal_request: { request_type: "callback", content: "Please call about scheduling.", request_key: "inactive-callback" } }
    @patient_session.post "/api/patient_portal/requests", params: callback, headers: @patient_headers, as: :json
    assert_equal 201, @patient_session.response.status
    @patient_session.post "/api/patient_portal/requests", params: callback, headers: @patient_headers, as: :json
    assert_equal 200, @patient_session.response.status
    assert_equal 1, @practice.patient_portal_requests.callback.count
    appointment = create_appointment(starts_at:)
    @patient_session.post patient_requests_path, params: appointment_change_payload("inactive-cancel", "cancel", appointment),
      headers: @patient_headers, as: :json
    assert_equal 201, @patient_session.response.status
    assert_equal "scheduled", appointment.reload.status
    request = @practice.patient_portal_requests.callback.sole
    @patient_session.get "/api/clinic/callback_requests", headers: @patient_headers
    assert_includes [401, 403], @patient_session.response.status
    grant_permissions!(@staff_membership, "appointments.write")
    @staff_session.get "/api/clinic/callback_requests", headers: @staff_headers
    assert_equal 200, @staff_session.response.status
    assert_equal [request.id], @staff_session.response.parsed_body.fetch("callback_requests").pluck("id")
    finish = { callback_request: { request_key: "callback-finish", status: "resolved", review_note: "" } }
    @staff_session.post "/api/clinic/callback_requests/#{request.id}/transition", params: finish, headers: @staff_headers, as: :json
    assert_equal 422, @staff_session.response.status
    finish[:callback_request][:review_note] = "Reached patient; discussed available appointment times."
    2.times do
      @staff_session.post "/api/clinic/callback_requests/#{request.id}/transition", params: finish, headers: @staff_headers, as: :json
      assert_equal 200, @staff_session.response.status
    end
    assert_equal "resolved", request.reload.status
    assert_equal "scheduled", appointment.reload.status
  end

  test "appointment request options read the telehealth setting once across visit types" do
    8.times { |index| @practice.visit_types.create!(code: "REQUEST-OPTION-#{index}") }
    setting_queries = []
    subscriber = lambda do |_name, _started, _finished, _unique_id, payload|
      sql = payload[:sql].to_s
      setting_queries << sql if sql.match?(/\ASELECT.*FROM "clinic_telehealth_settings"/mi)
    end

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        get_patient_requests
      end
    end

    assert_equal 1, setting_queries.length, setting_queries.join("\n")
    assert_equal 9, @patient_session.response.parsed_body.dig("options", "visit_types").length
  end

  test "reschedule exact request replays its original snapshot after current appointment changes" do
    assert_change_request_recovery("reschedule")
  end

  test "cancel exact request replays its original snapshot after current appointment changes" do
    assert_change_request_recovery("cancel")
  end

  test "patient reschedule request updates the same appointment and is idempotent" do
    source = create_appointment(starts_at: 3.days.from_now.change(usec: 0))
    original_count = @practice.appointments.where(patient: @patient).count
    requested_start = source.starts_at + 3.hours
    requested_end = requested_start + 45.minutes
    payload = appointment_change_payload(
      "patient-reschedule",
      "reschedule",
      source,
      starts_at: requested_start,
      ends_at: requested_end
    )

    @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
    assert_equal 201, @patient_session.response.status
    request_json = @patient_session.response.parsed_body.fetch("appointment_request")
    assert_equal "reschedule", request_json.fetch("request_kind")
    assert_equal source.id, request_json.dig("source_appointment", "id")
    assert_equal source.updated_at.iso8601(6), request_json.dig("source_appointment", "updated_at")
    assert_nil request_json.fetch("appointment")

    @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
    assert_equal 200, @patient_session.response.status
    assert_equal request_json.fetch("id"), @patient_session.response.parsed_body.dig("appointment_request", "id")

    duplicate = appointment_change_payload(
      "patient-reschedule-duplicate",
      "reschedule",
      source,
      starts_at: requested_start,
      ends_at: requested_end
    )
    @patient_session.post patient_requests_path, params: duplicate, headers: @patient_headers, as: :json
    assert_equal 409, @patient_session.response.status

    review = { review: {
      request_key: "patient-reschedule-review",
      starts_at: requested_start.iso8601,
      ends_at: requested_end.iso8601
    } }
    @staff_session.post "#{staff_requests_path}/#{request_json.fetch('id')}/approve",
      params: review, headers: @staff_headers, as: :json

    assert_equal 200, @staff_session.response.status
    assert_equal source.id, @staff_session.response.parsed_body.dig("appointment", "id")
    assert_equal requested_start, source.reload.starts_at
    assert_equal original_count, @practice.appointments.where(patient: @patient).count
    reviewed = Clinic::PatientPortal::AppointmentRequest.find(request_json.fetch("id"))
    assert reviewed.approved?
    assert_equal source.id, reviewed.appointment_id

    @staff_session.post "#{staff_requests_path}/#{request_json.fetch('id')}/approve",
      params: review, headers: @staff_headers, as: :json
    assert_equal 200, @staff_session.response.status
    assert_equal true, @staff_session.response.parsed_body.fetch("replayed")
    assert_equal original_count, @practice.appointments.where(patient: @patient).count
  end

  test "patient cancellation request cancels the same appointment without a target window" do
    source = create_appointment(starts_at: 4.days.from_now.change(usec: 0), status: "confirmed")
    original_count = @practice.appointments.where(patient: @patient).count
    payload = appointment_change_payload("patient-cancel", "cancel", source)

    @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
    assert_equal 201, @patient_session.response.status
    request_json = @patient_session.response.parsed_body.fetch("appointment_request")
    assert_equal "cancel", request_json.fetch("request_kind")
    assert_nil request_json.fetch("starts_at")
    assert_nil request_json.fetch("ends_at")
    assert_equal "confirmed", request_json.dig("source_appointment", "status")

    @staff_session.post "#{staff_requests_path}/#{request_json.fetch('id')}/approve",
      params: { review: { request_key: "patient-cancel-review" } }, headers: @staff_headers, as: :json

    assert_equal 200, @staff_session.response.status
    assert_equal source.id, @staff_session.response.parsed_body.dig("appointment", "id")
    assert_equal "cancelled", source.reload.status
    assert_equal original_count, @practice.appointments.where(patient: @patient).count
    reviewed = Clinic::PatientPortal::AppointmentRequest.find(request_json.fetch("id"))
    assert reviewed.approved?
    assert_equal source.id, reviewed.appointment_id
  end

  test "appointment changes reject stale source versions and appointments owned by another patient" do
    source = create_appointment(starts_at: 5.days.from_now.change(usec: 0))
    stale_updated_at = source.updated_at
    source.update!(starts_at: source.starts_at + 1.hour, ends_at: source.ends_at + 1.hour)
    stale_payload = appointment_change_payload(
      "stale-at-submit",
      "cancel",
      source,
      source_updated_at: stale_updated_at
    )

    @patient_session.post patient_requests_path, params: stale_payload, headers: @patient_headers, as: :json
    assert_equal 409, @patient_session.response.status
    assert_equal "stale_record", @patient_session.response.parsed_body.fetch("code")

    current_payload = appointment_change_payload("stale-at-review", "cancel", source)
    @patient_session.post patient_requests_path, params: current_payload, headers: @patient_headers, as: :json
    assert_equal 201, @patient_session.response.status
    request_id = @patient_session.response.parsed_body.dig("appointment_request", "id")
    source.update!(status: "confirmed")

    @staff_session.post "#{staff_requests_path}/#{request_id}/approve",
      params: { review: { request_key: "stale-at-review-decision" } }, headers: @staff_headers, as: :json
    assert_equal 409, @staff_session.response.status
    assert_equal "stale_record", @staff_session.response.parsed_body.fetch("code")
    assert Clinic::PatientPortal::AppointmentRequest.find(request_id).pending?
    assert_equal 1, @practice.appointments.where(patient: @patient).count

    other_patient = @practice.patients.create!(display_name: "Other Appointment Owner", reference: "APPOINTMENT-OWNER-002")
    foreign_source = create_appointment(
      patient: other_patient,
      starts_at: 7.days.from_now.change(usec: 0)
    )
    foreign_payload = appointment_change_payload("foreign-owner-change", "cancel", foreign_source)
    @patient_session.post patient_requests_path, params: foreign_payload, headers: @patient_headers, as: :json
    assert_equal 404, @patient_session.response.status

    get_patient_requests
    upcoming_ids = @patient_session.response.parsed_body.fetch("upcoming_appointments").map { |row| row.fetch("id") }
    assert_includes upcoming_ids, source.id
    assert_not_includes upcoming_ids, foreign_source.id
  end

  test "staff queue is tenant and site scoped through appointment read permission" do
    allowed = create_request(key: "allowed-site-request", site: @site)
    create_request(key: "denied-site-request", site: @other_site)

    other_practice = Clinic::Practice.create!(
      name: "Foreign Appointment Review Practice",
      organization: @practice.organization
    )
    other_patient = other_practice.patients.create!(display_name: "Foreign Patient", reference: "FOREIGN-REQUEST-001")
    other_user = User.create!(email_address: "foreign-portal@example.invalid", password: SecureRandom.hex(18))
    other_identity = Clinic::PatientPortal::Identity.create!(
      practice: other_practice, patient: other_patient, user: other_user, status: :active,
      invited_at: 1.day.ago, activated_at: 1.day.ago
    )
    other_site = create_site(other_practice, "FOREIGN-SITE")
    foreign = create_request(
      practice: other_practice, patient: other_patient, identity: other_identity,
      key: "foreign-request", site: other_site, visit_type: nil
    )

    revoke_all_permissions!(@staff_membership)
    grant_permissions!(@staff_membership, "appointments.read", scope_kind: "site", site: @site)

    @staff_session.get staff_requests_path, headers: @staff_headers
    assert_equal 200, @staff_session.response.status
    ids = @staff_session.response.parsed_body.fetch("appointment_requests").map { |request| request.fetch("id") }
    assert_equal [ allowed.id ], ids
    assert_not_includes ids, foreign.id

    @staff_session.get staff_requests_path, params: { site_id: @other_site.id }, headers: @staff_headers
    assert_equal 403, @staff_session.response.status
  end

  test "staff approval books exactly one appointment and patient history shows the approved time" do
    request = create_request(key: "approve-request", site: @site)
    actual_start = (request.starts_at + 2.hours).change(usec: 0)
    actual_end = actual_start + 45.minutes
    payload = approval_payload("approve-request-review", actual_start, actual_end)

    @staff_session.post "#{staff_requests_path}/#{request.id}/approve",
      params: payload, headers: @staff_headers, as: :json

    assert_equal 200, @staff_session.response.status
    assert_equal false, @staff_session.response.parsed_body.fetch("replayed")
    appointment_id = @staff_session.response.parsed_body.dig("appointment", "id")
    reviewed = request.reload
    assert reviewed.approved?
    assert_equal appointment_id, reviewed.appointment_id
    assert_equal @staff_membership.id, reviewed.reviewed_by_membership_id
    assert reviewed.reviewed_at
    assert_equal actual_start, reviewed.appointment.starts_at
    assert_equal @room.id, reviewed.appointment.room_id
    assert_equal @clinician.id, reviewed.appointment.booked_clinician_id

    @staff_session.post "#{staff_requests_path}/#{request.id}/approve",
      params: payload, headers: @staff_headers, as: :json
    assert_equal 200, @staff_session.response.status
    assert_equal true, @staff_session.response.parsed_body.fetch("replayed")
    assert_equal 1, @practice.appointments.where(patient: @patient).count

    get_patient_requests
    row = @patient_session.response.parsed_body.fetch("appointment_requests").find do |item|
      item.fetch("id") == request.id
    end
    assert_equal actual_start.iso8601(6), row.dig("appointment", "starts_at")
    assert_not_equal row.fetch("starts_at"), row.dig("appointment", "starts_at")
  end

  test "expired requests become terminal before staff can create an appointment" do
    request = create_request(
      key: "expired-booking-request",
      site: @site,
      starts_at: 3.hours.ago.change(usec: 0)
    )

    get_patient_requests

    row = @patient_session.response.parsed_body.fetch("appointment_requests").find do |item|
      item.fetch("id") == request.id
    end
    assert_equal "expired", row.fetch("status")
    assert request.reload.expired?

    future_start = 2.days.from_now.change(usec: 0)
    @staff_session.post "#{staff_requests_path}/#{request.id}/approve",
      params: approval_payload("expired-booking-review", future_start, future_start + 1.hour),
      headers: @staff_headers, as: :json

    assert_equal 409, @staff_session.response.status
    assert request.reload.expired?
    assert_nil request.appointment_id
    assert_empty @practice.appointments.where(patient: @patient)
  end

  test "staff cannot review a hidden source request into an allowed target site" do
    request = create_request(key: "hidden-source-request", site: @other_site)
    revoke_all_permissions!(@staff_membership)
    grant_permissions!(@staff_membership, "appointments.read", scope_kind: "site", site: @site)
    grant_permissions!(@staff_membership, "appointments.book", scope_kind: "site", site: @site)

    @staff_session.post "#{staff_requests_path}/#{request.id}/approve",
      params: approval_payload("hidden-source-review", request.starts_at, request.ends_at),
      headers: @staff_headers, as: :json

    assert_equal 404, @staff_session.response.status
    assert request.reload.pending?
    assert_nil request.appointment_id
    assert_equal 0, @practice.appointments.where(patient: @patient).count
  end

  test "approval rejects inactive identities stale decisions and foreign booking ids without appointments" do
    inactive = create_request(key: "inactive-identity-request", site: @site)
    @identity.update!(status: :revoked, revoked_at: Time.current)
    @staff_session.post "#{staff_requests_path}/#{inactive.id}/approve",
      params: approval_payload("inactive-review", inactive.starts_at, inactive.ends_at),
      headers: @staff_headers, as: :json
    assert_equal 409, @staff_session.response.status
    assert_nil inactive.reload.appointment_id

    @identity.update!(status: :active, revoked_at: nil)
    request = create_request(key: "foreign-room-request", site: @site)
    other_practice = Clinic::Practice.create!(name: "Foreign Booking IDs Practice", organization: @practice.organization)
    foreign_site = create_site(other_practice, "FOREIGN-BOOKING-SITE")
    foreign_room = other_practice.rooms.create!(site: foreign_site, code: "FOREIGN-ROOM")
    invalid_payload = approval_payload("foreign-room-review", request.starts_at, request.ends_at)
    invalid_payload[:review][:room_id] = foreign_room.id
    @staff_session.post "#{staff_requests_path}/#{request.id}/approve",
      params: invalid_payload, headers: @staff_headers, as: :json
    assert_equal 404, @staff_session.response.status
    assert_nil request.reload.appointment_id

    @staff_session.post "#{staff_requests_path}/#{request.id}/approve",
      params: approval_payload("valid-review", request.starts_at, request.ends_at),
      headers: @staff_headers, as: :json
    assert_equal 200, @staff_session.response.status
    @staff_session.post "#{staff_requests_path}/#{request.id}/decline",
      params: { review: { request_key: "stale-decline" } }, headers: @staff_headers, as: :json
    assert_equal 409, @staff_session.response.status
    assert_equal 1, @practice.appointments.where(patient: @patient, id: request.reload.appointment_id).count
  end

  test "staff decline is idempotent and leaves other patient portal features gated" do
    request = create_request(key: "decline-request", site: @site)
    payload = { review: { request_key: "decline-review", reason: "Requested window is unavailable" } }

    @staff_session.post "#{staff_requests_path}/#{request.id}/decline",
      params: payload, headers: @staff_headers, as: :json
    assert_equal 200, @staff_session.response.status
    assert_equal false, @staff_session.response.parsed_body.fetch("replayed")
    assert request.reload.declined?
    assert_equal "Requested window is unavailable", request.review_note
    assert_nil request.appointment_id

    @staff_session.post "#{staff_requests_path}/#{request.id}/decline",
      params: payload, headers: @staff_headers, as: :json
    assert_equal 200, @staff_session.response.status
    assert_equal true, @staff_session.response.parsed_body.fetch("replayed")
    assert_equal 0, @practice.appointments.where(patient: @patient).count

    @patient_session.post "/api/patient_portal/reminder_preferences",
      params: { preference: { channel: "portal", setting: "allowed", timezone: "UTC" } }, headers: @patient_headers, as: :json
    assert_equal 404, @patient_session.response.status
    assert_equal "patient_portal_billing_only", @patient_session.response.parsed_body.fetch("code")
  end

  private

  def assert_change_request_recovery(kind)
    source = create_appointment(starts_at: 3.days.from_now.change(usec: 0))
    payload = appointment_change_payload("synthetic-#{kind}-snapshot-recovery", kind, source,
      starts_at: kind == "reschedule" ? source.starts_at + 3.hours : nil,
      ends_at: kind == "reschedule" ? source.ends_at + 3.hours : nil)
    @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
    assert_equal 201, @patient_session.response.status
    saved = @patient_session.response.parsed_body.fetch("appointment_request")
    request = Clinic::PatientPortal::AppointmentRequest.find(saved.fetch("id"))
    original_request_attributes = request.attributes
    assert_equal kind, saved.fetch("request_kind")
    assert_equal source.updated_at.iso8601(6), saved.dig("source_appointment", "updated_at")
    assert_nil saved.fetch("appointment")
    if kind == "cancel"
      assert_nil saved.fetch("starts_at")
      assert_nil saved.fetch("ends_at")
    end

    source.update!(starts_at: source.starts_at + 1.hour, ends_at: source.ends_at + 1.hour)
    current_source_attributes = source.reload.attributes
    assert_no_difference "Clinic::PatientPortal::AppointmentRequest.count" do
      assert_no_difference "Clinic::Appointment.count" do
        @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
        assert_equal 200, @patient_session.response.status
        assert_equal saved, @patient_session.response.parsed_body.fetch("appointment_request")
        assert_equal original_request_attributes, request.reload.attributes
        assert_equal current_source_attributes, source.reload.attributes

        changed = payload.deep_dup
        changed[:appointment_request][:source_appointment_updated_at] = source.updated_at.iso8601(6)
        @patient_session.post patient_requests_path, params: changed, headers: @patient_headers, as: :json
        assert_equal 409, @patient_session.response.status
        refute @patient_session.response.parsed_body.key?("appointment_request")

        fresh = payload.deep_dup
        fresh[:appointment_request][:request_key] = "synthetic-#{kind}-fresh-stale-source"
        @patient_session.post patient_requests_path, params: fresh, headers: @patient_headers, as: :json
        assert_equal 409, @patient_session.response.status
        assert_equal "stale_record", @patient_session.response.parsed_body.fetch("code")
      end
    end
    @identity.update!(status: "revoked", revoked_at: Time.current)
    assert_no_difference "Clinic::PatientPortal::AppointmentRequest.count" do
      @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
      assert_equal 404, @patient_session.response.status
      refute @patient_session.response.parsed_body.key?("appointment_request")
    end
    assert_equal original_request_attributes, request.reload.attributes
    assert_equal current_source_attributes, source.reload.attributes
  end

  def patient_requests_path
    "/api/patient_portal/appointment_requests"
  end

  def staff_requests_path
    "/api/clinic/appointment_requests"
  end

  def get_patient_requests
    @patient_session.get patient_requests_path, headers: @patient_headers
    assert_equal 200, @patient_session.response.status
  end

  def patient_request_payload(key, starts_at, ends_at)
    {
      appointment_request: {
        request_key: key,
        starts_at: starts_at.iso8601,
        ends_at: ends_at.iso8601,
        site_id: @site.id,
        visit_type_id: @visit_type.id
      }
    }
  end

  def approval_payload(key, starts_at, ends_at)
    {
      review: {
        request_key: key,
        starts_at: starts_at.iso8601,
        ends_at: ends_at.iso8601,
        site_id: @site.id,
        room_id: @room.id,
        booked_clinician_id: @clinician.id,
        visit_type_id: @visit_type.id
      }
    }
  end

  def appointment_change_payload(key, kind, source, starts_at: nil, ends_at: nil,
    source_updated_at: source.updated_at)
    request = {
      request_key: key,
      request_kind: kind,
      source_appointment_id: source.id,
      source_appointment_updated_at: source_updated_at.iso8601(6)
    }
    request[:starts_at] = starts_at.iso8601 if starts_at
    request[:ends_at] = ends_at.iso8601 if ends_at
    { appointment_request: request }
  end

  def create_appointment(patient: @patient, starts_at:, status: "scheduled")
    @practice.appointments.create!(
      patient: patient,
      site: @site,
      room: @room,
      booked_clinician: @clinician,
      visit_type: @visit_type,
      starts_at: starts_at,
      ends_at: starts_at + 1.hour,
      status: status
    )
  end

  def create_request(practice: @practice, patient: @patient, identity: @identity, key:, site: @site,
    visit_type: @visit_type, starts_at: 2.days.from_now.change(hour: 9, min: 0, sec: 0, usec: 0))
    Clinic::PatientPortal::AppointmentRequest.create!(
      practice: practice,
      patient: patient,
      identity: identity,
      request_key: key,
      starts_at: starts_at,
      ends_at: starts_at + 1.hour,
      site: site,
      visit_type: visit_type,
      status: :pending,
      requested_at: Time.current
    )
  end

  def create_site(practice, code)
    practice.sites.create!(
      code: code,
      name: code.titleize,
      status: "active",
      address_line1: "100 Example Street",
      city: "Sherman",
      state: "TX",
      postal_code: "75090",
      country: "US"
    )
  end

  def create_membership(practice, email)
    user = User.create!(email_address: email, password: SecureRandom.hex(18))
    practice.memberships.create!(user: user)
  end

  def authenticated_session(user, password, profile: nil)
    session = open_session
    session.host! "localhost:3000"
    session.get "/api/csrf", headers: @headers
    headers = @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))
    if profile
      session.post "/api/development_session", params: { profile: profile }, headers: headers, as: :json
      assert_equal 201, session.response.status
    else
      session.post "/api/session", params: { email_address: user.email_address, password: password }, headers: headers, as: :json
      assert_equal 200, session.response.status
    end
    session.get "/api/csrf", headers: @headers
    headers = @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))
    [ session, headers ]
  end
end
