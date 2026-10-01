require "test_helper"

class AppointmentCreateIdempotencyTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @own = tenant("own")
    @foreign = tenant("foreign")
    login(@own.fetch(:user))
  end

  test "keyed appointment creation replays exactly, rejects changed data, and stays practice scoped" do
    request_key = "appointment-create-replay"
    payload = appointment_payload(@own, request_key:)

    assert_difference -> { @own.fetch(:practice).appointments.count }, 1 do
      submit "/api/clinic/appointments", payload
      assert_response :created
      @created_id = response.parsed_body.dig("appointment", "id")
      assert_equal request_key, response.parsed_body.fetch("request_key")

      submit "/api/clinic/appointments", payload
      assert_response :created
      assert_equal @created_id, response.parsed_body.dig("appointment", "id")
      assert_equal request_key, response.parsed_body.fetch("request_key")
    end
    assert_equal 1, Clinic::OperationReceipt.where(
      practice: @own.fetch(:practice), operation_code: "appointments.book", request_key:
    ).count

    assert_no_difference -> { @own.fetch(:practice).appointments.count } do
      submit "/api/clinic/appointments", payload.deep_merge(
        appointment: { ends_at: "2026-10-01T10:00:00Z" }
      )
      assert_response :conflict
      assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    end

    login(@foreign.fetch(:user))
    assert_difference -> { @foreign.fetch(:practice).appointments.count }, 1 do
      submit "/api/clinic/appointments", appointment_payload(@foreign, request_key:)
      assert_response :created
      assert_equal request_key, response.parsed_body.fetch("request_key")
    end
    assert_equal 1, Clinic::OperationReceipt.where(
      practice: @foreign.fetch(:practice), operation_code: "appointments.book", request_key:
    ).count
  end

  test "capacity rejection cannot create or masquerade as an earlier completed appointment" do
    practice = @own.fetch(:practice)
    practice.update!(timezone: "America/Chicago")
    grant_permissions!(practice.memberships.find_by!(user: @own.fetch(:user)), "appointments.read")
    prior = practice.appointments.create!(patient: @own.fetch(:patient), site: @own.fetch(:site),
      booked_clinician: @own.fetch(:clinician), visit_type: @own.fetch(:visit_type),
      starts_at: Time.iso8601("2026-09-28T09:00:00-05:00"),
      ends_at: Time.iso8601("2026-09-28T09:30:00-05:00"), status: "completed")
    prior_attributes = prior.attributes
    payload = appointment_payload(@own, request_key: "muse-179-capacity-denied").deep_merge(
      appointment: { starts_at: "2026-09-30T10:00:00-05:00", ends_at: "2026-09-30T10:30:00-05:00" }
    )

    # The tenant has Thursday capacity only; the requested Wednesday is denied.
    assert_no_difference [ -> { practice.appointments.count }, -> { Clinic::OperationReceipt.count } ] do
      submit "/api/clinic/appointments", payload
      assert_response :unprocessable_entity
      assert_equal "This time is outside the clinician's capacity template for this site.", response.parsed_body.fetch("error")
      assert_nil response.parsed_body["appointment"]
    end
    assert_equal prior_attributes, prior.reload.attributes
    get "/api/clinic/appointments", params: { from_date: "2026-09-28", through_date: "2026-09-30" }, headers: @headers
    assert_response :success
    assert_equal [ prior.id ], response.parsed_body.fetch("appointments").pluck("id")

    # A deliberate configuration correction permits the same intent. Verify
    # its identity and instants through an independent server read, not a row label.
    Clinic::Scheduling::CapacityRule.create!(practice: practice, site: @own.fetch(:site),
      clinician: @own.fetch(:clinician), kind: "weekly", weekday: 3,
      start_minute: 600, end_minute: 630, active: true)
    assert_difference -> { practice.appointments.count }, 1 do
      submit "/api/clinic/appointments", payload
      assert_response :created
    end
    booked_id = response.parsed_body.fetch("appointment").fetch("id")
    assert_not_equal prior.id, booked_id
    receipt = Clinic::OperationReceipt.find_by!(practice: practice, operation_code: "appointments.book",
      request_key: "muse-179-capacity-denied")
    assert_equal booked_id.to_s, receipt.resource_id.to_s
    get "/api/clinic/appointments/#{booked_id}", headers: @headers
    assert_response :success
    booked = response.parsed_body.fetch("appointment")
    assert_equal @own.fetch(:patient).id, booked.fetch("patient_id")
    assert_equal @own.fetch(:site).id, booked.fetch("site_id")
    assert_equal "scheduled", booked.fetch("status")
    assert_equal Time.iso8601("2026-09-30T15:00:00Z"), Time.iso8601(booked.fetch("starts_at"))
    assert_equal Time.iso8601("2026-09-30T15:30:00Z"), Time.iso8601(booked.fetch("ends_at"))
    assert_equal prior_attributes, prior.reload.attributes

    # A stale request key cannot silently return the old result for new times.
    assert_no_difference -> { practice.appointments.count } do
      submit "/api/clinic/appointments", payload.deep_merge(appointment: {
        starts_at: "2026-09-28T09:00:00-05:00", ends_at: "2026-09-28T09:30:00-05:00"
      })
      assert_response :conflict
      assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
    end
  end

  test "legacy appointment creation remains available without a request key" do
    assert_difference -> { @own.fetch(:practice).appointments.count }, 1 do
      submit "/api/clinic/appointments", appointment_payload(@own).except(:request_key)
      assert_response :created
    end
  end

  test "published offering booking persists its identity and original configuration after retirement" do
    offering = published_offering(@own)
    payload = appointment_payload(@own, request_key: "offering-booking").deep_merge(
      appointment: { service_offering_id: offering.id }
    )

    submit "/api/clinic/appointments", payload
    assert_response :created
    booked = response.parsed_body.fetch("appointment")
    assert_equal offering.id, booked.fetch("service_offering_id")
    assert_equal offering.name, booked.dig("service_offering_snapshot", "name")

    offering.update!(status: "retired", retired_at: Time.current)
    submit "/api/clinic/appointments", payload
    assert_response :created
    assert_equal booked.fetch("id"), response.parsed_body.dig("appointment", "id")

    appointment = @own.fetch(:practice).appointments.find(booked.fetch("id"))
    assert_equal offering.id, appointment.service_offering_id
    assert_equal offering.name, appointment.service_offering_snapshot.fetch("name")
    assert_equal offering.name, Clinic::Scheduling::AppointmentSerializer.call(appointment).dig(:service_offering_snapshot, "name")

    submit "/api/clinic/appointments", appointment_payload(@own, request_key: "retired-new").deep_merge(
      appointment: { service_offering_id: offering.id, starts_at: "2026-10-01T10:00:00Z", ends_at: "2026-10-01T10:30:00Z" }
    )
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "published"

    submit "/api/clinic/appointments", appointment_payload(@own, request_key: "independent-booking").deep_merge(
      appointment: { starts_at: "2026-10-01T11:00:00Z", ends_at: "2026-10-01T11:30:00Z" }
    )
    assert_response :created
    assert_nil response.parsed_body.dig("appointment", "service_offering_id")
  end

  test "offering booking denies foreign and incompatible configuration and reschedule cannot reuse retirement" do
    offering = published_offering(@own)
    base = appointment_payload(@own, request_key: "offering-validation")
    incomplete = @own.fetch(:practice).appointments.create!(patient: @own.fetch(:patient),
      starts_at: Time.iso8601("2026-10-01T12:00:00Z"), ends_at: Time.iso8601("2026-10-01T12:30:00Z"),
      status: "scheduled")
    patch "/api/clinic/appointments/#{incomplete.id}", params: { appointment: {
      starts_at: "2026-10-01T13:00:00Z", ends_at: "2026-10-01T13:30:00Z",
      expected_updated_at: incomplete.updated_at.iso8601(6), request_key: "incomplete-offering-reschedule",
      service_offering_id: offering.id
    } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "site, clinician, and visit type"

    foreign = published_offering(@foreign)
    submit "/api/clinic/appointments", base.deep_merge(appointment: { service_offering_id: foreign.id })
    assert_response :not_found

    other_site = @own.fetch(:practice).sites.create!(code: "OTHER-SITE")
    submit "/api/clinic/appointments", base.deep_merge(appointment: { service_offering_id: offering.id, site_id: other_site.id })
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "site"

    submit "/api/clinic/appointments", base.deep_merge(appointment: { service_offering_id: offering.id,
      ends_at: "2026-10-01T10:00:00Z" })
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "duration"

    submit "/api/clinic/appointments", base.deep_merge(appointment: { service_offering_id: offering.id })
    assert_response :created
    booked = response.parsed_body.fetch("appointment")
    offering.update!(status: "retired", retired_at: Time.current)

    patch "/api/clinic/appointments/#{booked.fetch('id')}", params: { appointment: {
      starts_at: "2026-10-01T10:00:00Z", ends_at: "2026-10-01T10:30:00Z",
      expected_updated_at: booked.fetch("updated_at"), request_key: "retired-reschedule"
    } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "published"

    patch "/api/clinic/appointments/#{booked.fetch('id')}", params: { appointment: {
      starts_at: "2026-10-01T10:00:00Z", ends_at: "2026-10-01T10:30:00Z",
      expected_updated_at: booked.fetch("updated_at"), request_key: "independent-reschedule", service_offering_id: nil
    } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_nil response.parsed_body.dig("appointment", "service_offering_id")
    assert_nil @own.fetch(:practice).appointments.find(booked.fetch("id")).service_offering_snapshot
  end

  test "an eligible team limits new and rescheduled offering bookings without limiting visit-type booking" do
    offering = published_offering(@own)
    practice = @own.fetch(:practice)
    selected_clinician = @own.fetch(:clinician)
    other_user = User.create!(email_address: "offering-other-clinician@example.invalid", password: @password)
    other_member = practice.memberships.create!(user: other_user)
    other_clinician = practice.clinician_profiles.create!(membership: other_member, display_name: "Other synthetic clinician")
    Clinic::Scheduling::CapacityRule.create!(practice: practice, site: @own.fetch(:site), clinician: other_clinician,
      kind: "weekly", weekday: 4, start_minute: 0, end_minute: 1440, active: true)
    offering.offering_clinicians.create!(practice: practice, clinician: selected_clinician)

    denied = appointment_payload(@own, request_key: "offering-wrong-clinician").deep_merge(
      appointment: { booked_clinician_id: other_clinician.id, service_offering_id: offering.id })
    assert_no_difference -> { practice.appointments.count } do
      submit "/api/clinic/appointments", denied
    end
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "not eligible"

    submit "/api/clinic/appointments", appointment_payload(@own, request_key: "offering-right-clinician").deep_merge(
      appointment: { service_offering_id: offering.id })
    assert_response :created
    booked = response.parsed_body.fetch("appointment")
    assert_equal [ selected_clinician.id ], booked.dig("service_offering_snapshot", "eligible_clinician_ids")

    patch "/api/clinic/appointments/#{booked.fetch('id')}", params: { appointment: {
      starts_at: "2026-10-01T10:00:00Z", ends_at: "2026-10-01T10:30:00Z",
      expected_updated_at: booked.fetch("updated_at"), request_key: "offering-reschedule-wrong-clinician",
      booked_clinician_id: other_clinician.id
    } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "not eligible"

    submit "/api/clinic/appointments", appointment_payload(@own, request_key: "independent-other-clinician").deep_merge(
      appointment: { booked_clinician_id: other_clinician.id, starts_at: "2026-10-01T10:00:00Z",
        ends_at: "2026-10-01T10:30:00Z" })
    assert_response :created
    assert_nil response.parsed_body.dig("appointment", "service_offering_id")
  end

  test "appointment creation rejects missing operational setup" do
    assert_no_difference -> { @own.fetch(:practice).appointments.count } do
      submit "/api/clinic/appointments", appointment_payload(@own).deep_merge(
        appointment: { booked_clinician_id: nil }
      )
      assert_response :unprocessable_entity
      assert_includes response.parsed_body.fetch("error"), "clinician"
    end
  end

  test "calendar ranges include the complete clinic day across both DST transitions without leaking tenants" do
    practice = @own.fetch(:practice)
    practice.update!(timezone: "America/Chicago")
    grant_permissions!(practice.memberships.find_by!(user: @own.fetch(:user)), "appointments.read")

    [
      [ "2026-03-08", "2026-03-08T06:00:00Z", "2026-03-09T05:00:00Z" ],
      [ "2026-11-01", "2026-11-01T05:00:00Z", "2026-11-02T06:00:00Z" ]
    ].each do |date, first_instant, next_day|
      from = Time.iso8601(first_instant)
      through = Time.iso8601(next_day)
      appointments = [ from - 1.second, from, through - 1.second, through ].map do |instant|
        practice.appointments.create!(patient: @own.fetch(:patient), site: @own.fetch(:site),
          starts_at: instant, ends_at: instant + 30.minutes, status: "scheduled", visit_modality: "in_person")
      end
      @foreign.fetch(:practice).appointments.create!(patient: @foreign.fetch(:patient), site: @foreign.fetch(:site),
        starts_at: from, ends_at: from + 30.minutes, status: "scheduled", visit_modality: "in_person")

      get "/api/clinic/appointments", params: { from_date: date, through_date: date }, headers: @headers
      assert_response :success
      assert_equal appointments[1..2].map(&:id), response.parsed_body.fetch("appointments").pluck("id")
      assert_equal 2, response.parsed_body.dig("pagination", "total")

      get "/api/clinic/appointments", params: { from: first_instant, to: next_day }, headers: @headers
      assert_response :success
      assert_equal appointments[1..2].map(&:id), response.parsed_body.fetch("appointments").pluck("id")
    end
  end

  test "appointment lists reuse preloaded patient phone endpoints" do
    practice = @own.fetch(:practice)
    patient = @own.fetch(:patient)
    grant_permissions!(practice.memberships.find_by!(user: @own.fetch(:user)), "appointments.read")
    practice.communication_endpoints.create!(patient: patient, endpoint_type: "phone", label: "Mobile",
      value: "+15005550123", value_digest: Digest::SHA256.hexdigest("+15005550123"), verified_at: Time.current)
    2.times do |index|
      starts_at = Time.utc(2026, 10, 2, 9 + index)
      practice.appointments.create!(patient: patient, site: @own.fetch(:site), starts_at: starts_at,
        ends_at: starts_at + 30.minutes, status: "scheduled")
    end
    queries = []
    subscriber = ->(_name, _started, _finished, _unique_id, payload) { queries << payload[:sql].to_s }

    ActiveRecord::Base.uncached do
      ActiveSupport::Notifications.subscribed(subscriber, "sql.active_record") do
        get "/api/clinic/appointments", headers: @headers
      end
    end

    assert_response :success
    assert_equal [ "+15005550123", "+15005550123" ], response.parsed_body.fetch("appointments").pluck("patient").pluck("phone")
    assert_equal 1, queries.count { |sql| sql.match?(/FROM "clinic_communication_endpoints"/i) }, queries.join("\n")
  end

  test "incomplete and reversed calendar ranges fail instead of widening the appointment search" do
    grant_permissions!(@own.fetch(:practice).memberships.find_by!(user: @own.fetch(:user)), "appointments.read")
    [
      { from_date: "", through_date: "2026-09-10" },
      { from_date: "2026-09-10" },
      { from_date: "2026-09-11", through_date: "2026-09-10" },
      { from_date: "2026-02-30", through_date: "2026-03-01" }
    ].each do |range|
      get "/api/clinic/appointments", params: range, headers: @headers
      assert_response :bad_request
      assert response.parsed_body.fetch("error").present?
    end
  end

  private

  def published_offering(tenant)
    practice = tenant.fetch(:practice)
    offering = practice.service_offerings.create!(name: "Selected follow-up", visit_type: tenant.fetch(:visit_type),
      duration_minutes: 30, modality: "either")
    offering.offering_sites.create!(practice: practice, site: tenant.fetch(:site))
    offering.update!(status: "published", published_at: Time.current)
    Clinic::Scheduling::ResourceCompatibility.create!(practice: practice, site: tenant.fetch(:site), service_offering: offering,
      written_by_membership: practice.memberships.find_by!(user: tenant.fetch(:user)), revision: 1, mode: "not_required")
    offering
  end

  def tenant(label)
    organization = Organization.create!(name: "Appointment create #{label} organization")
    practice = Clinic::Practice.create!(name: "Appointment create #{label} practice", organization:, timezone: "UTC")
    user = User.create!(email_address: "appointment-create-#{label}@example.invalid", password: @password)
    membership = practice.memberships.create!(user:)
    grant_permissions!(membership, "appointments.book")
    patient = practice.patients.create!(display_name: "Appointment create #{label} patient", reference: "CREATE-#{label.upcase}")
    site = practice.sites.create!(code: "CREATE-#{label.upcase}", status: "active")
    clinician = practice.clinician_profiles.create!(membership:, display_name: "Appointment create #{label} clinician")
    visit_type = practice.visit_types.create!(code: "CREATE-#{label.upcase}-VISIT")
    Clinic::Scheduling::CapacityRule.create!(practice:, site:, clinician:, kind: "weekly", weekday: 4,
      start_minute: 0, end_minute: 1440, active: true)
    { practice:, user:, patient:, site:, clinician:, visit_type: }
  end

  def appointment_payload(tenant, request_key: nil)
    appointment = {
      patient_id: tenant.fetch(:patient).id,
      site_id: tenant.fetch(:site).id,
      booked_clinician_id: tenant.fetch(:clinician).id,
      visit_type_id: tenant.fetch(:visit_type).id,
      starts_at: "2026-10-01T09:00:00Z",
      ends_at: "2026-10-01T09:30:00Z"
    }
    appointment[:request_key] = request_key if request_key
    { appointment: }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(path, params = {})
    post path, params:, headers: csrf_headers, as: :json
  end

  def login(user)
    submit "/api/session", { email_address: user.email_address, password: @password }
    assert_response :success
  end
end
