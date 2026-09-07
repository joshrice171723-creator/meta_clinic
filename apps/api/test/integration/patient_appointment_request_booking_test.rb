require "test_helper"

class PatientAppointmentRequestBookingTest < ActionDispatch::IntegrationTest
  setup do
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    organization = Organization.create!(name: "Appointment Request Review Organization")
    @practice = Clinic::Practice.create!(name: "Appointment Request Review Practice", organization: organization)

    @patient_password = SecureRandom.hex(18)
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
    grant_permissions!(@staff_membership, "appointments.read", "appointments.book")

    @site = create_site(@practice, "REQUEST-SITE")
    @other_site = create_site(@practice, "OTHER-REQUEST-SITE")
    @visit_type = @practice.visit_types.create!(code: "REQUEST-VISIT")
    @retired_visit_type = @practice.visit_types.create!(code: "RETIRED-VISIT", retired_at: Time.current)
    @room = @practice.rooms.create!(site: @site, code: "REQUEST-ROOM")
    clinician_membership = create_membership(@practice, "appointment-clinician@example.invalid")
    @clinician = @practice.clinician_profiles.create!(
      membership: clinician_membership,
      display_name: "Appointment Clinician",
      reference: "APPT-CLINICIAN"
    )

    @patient_session, @patient_headers = authenticated_session(@patient_user, @patient_password)
    @staff_session, @staff_headers = authenticated_session(@staff_user, @staff_password)
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
    assert_equal @site.id, created.dig("site", "id")
    assert_nil created.fetch("appointment")

    @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
    assert_equal 200, @patient_session.response.status
    assert_equal created.fetch("id"), @patient_session.response.parsed_body.dig("appointment_request", "id")

    travel_to(starts_at + 1.minute) do
      @patient_session.post patient_requests_path, params: payload, headers: @patient_headers, as: :json
      assert_equal 200, @patient_session.response.status
      assert_equal created.fetch("id"), @patient_session.response.parsed_body.dig("appointment_request", "id")
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

    @patient_session.post "/api/patient_portal/requests", params: {}, headers: @patient_headers, as: :json
    assert_equal 404, @patient_session.response.status
    assert_equal "patient_portal_billing_only", @patient_session.response.parsed_body.fetch("code")
  end

  private

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

  def create_request(practice: @practice, patient: @patient, identity: @identity, key:, site: @site,
    visit_type: @visit_type, starts_at: 2.days.from_now.change(usec: 0))
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

  def authenticated_session(user, password)
    session = open_session
    session.host! "localhost:3000"
    session.get "/api/csrf", headers: @headers
    headers = @headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))
    session.post "/api/session", params: { email_address: user.email_address, password: password }, headers: headers, as: :json
    assert_equal 200, session.response.status
    [ session, headers ]
  end
end
