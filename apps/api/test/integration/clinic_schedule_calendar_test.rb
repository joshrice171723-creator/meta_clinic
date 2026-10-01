require "test_helper"

class ClinicScheduleCalendarTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "calendar-flow@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic Calendar Flow", organization: Organization.create!(name: "Synthetic Calendar Flow"), timezone: "America/Chicago")
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "appointments.read", "appointments.book", "appointments.status_transition", "encounters.write")
    @site = @practice.sites.create!(code: "CAL", status: "active")
    @clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Synthetic Calendar Clinician")
    @patient = @practice.patients.create!(display_name: "Synthetic Calendar Patient", reference: "CAL-FLOW")
    @type = @practice.visit_types.create!(code: "Initial visit")
    @date = Date.current.next_month.beginning_of_month
    @start = ActiveSupport::TimeZone[@practice.timezone].local(@date.year, @date.month, @date.day, 9)
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: @date.wday, start_minute: 540, end_minute: 600, active: true)
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
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

  test "booking rejects a clinician assigned to another site" do
    other_site = @practice.sites.create!(code: "OTHER")
    department = @practice.departments.create!(code: "PRIMARY")
    @clinician.assignments.create!(practice: @practice, site: other_site, department: department,
      effective_from: @start - 1.day)
    payload = { appointment: { patient_id: @patient.id, site_id: @site.id, booked_clinician_id: @clinician.id,
      visit_type_id: @type.id, starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601, request_key: SecureRandom.uuid } }

    assert_no_difference -> { @practice.appointments.count } do
      post "/api/clinic/appointments", params: payload, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
    assert_match "not assigned to this site", response.parsed_body.fetch("error")
  end

  test "an active hold prevents a conflicting capacity block until released" do
    grant_permissions!(@membership, "facilities.write")
    finish = @start + 30.minutes
    post "/api/clinic/schedule_holds",
      params: { hold: { request_key: "capacity-held-slot", patient_id: @patient.id,
        site_id: @site.id, clinician_id: @clinician.id, starts_at: @start.iso8601,
        ends_at: finish.iso8601, expires_at: (Current.business_time + 30.minutes).iso8601 } },
      headers: csrf_headers, as: :json
    assert_response :created
    hold = response.parsed_body.fetch("hold")
    get_calendar
    visible_hold = day.fetch("holds").sole
    assert_equal hold.fetch("id"), visible_hold.fetch("id")
    assert_equal hold.fetch("lock_version"), visible_hold.fetch("lock_version")
    assert_equal @patient.id, visible_hold.fetch("patient_id")
    assert_equal @patient.display_name, visible_hold.fetch("patient_name")

    block = { capacity: { request_key: "held-capacity-block", site_id: @site.id,
      clinician_id: @clinician.id, kind: "block", starts_at: @start.iso8601,
      ends_at: finish.iso8601, reason: "Synthetic closure" } }
    assert_no_difference -> { Clinic::Scheduling::CapacityRule.where(practice: @practice, kind: "block").count } do
      post "/api/clinic/capacity", params: block, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
    assert_match(/release/i, response.parsed_body.fetch("error"))

    post "/api/clinic/schedule_holds/#{hold.fetch('id')}/release",
      params: { hold: { request_key: "release-for-capacity-block", lock_version: hold.fetch("lock_version") } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "released", response.parsed_body.fetch("hold").fetch("state")
    get_calendar
    assert_empty day.fetch("holds")

    assert_difference -> { Clinic::Scheduling::CapacityRule.where(practice: @practice, kind: "block").count }, 1 do
      post "/api/clinic/capacity", params: block, headers: csrf_headers, as: :json
    end
    assert_response :created
  end

  test "held slot books once and exact retry survives conversion" do
    hold_input = { hold: { request_key: "held-booking", patient_id: @patient.id,
      site_id: @site.id, clinician_id: @clinician.id, starts_at: @start.iso8601,
      ends_at: (@start + 30.minutes).iso8601,
      expires_at: (Current.business_time + 10.minutes).iso8601 } }
    post "/api/clinic/schedule_holds", params: hold_input, headers: csrf_headers, as: :json
    assert_response :created
    hold_id = response.parsed_body.dig("hold", "id")
    get_calendar
    assert_equal hold_id, day.fetch("holds").sole.fetch("id")
    assert_equal 1, day.fetch("available")

    booking = { appointment: { patient_id: @patient.id, site_id: @site.id,
      booked_clinician_id: @clinician.id, visit_type_id: @type.id, schedule_hold_id: hold_id,
      starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601,
      request_key: "book-held-slot" } }
    assert_difference -> { @practice.appointments.count }, 1 do
      post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
      assert_response :created
    end
    appointment_id = response.parsed_body.dig("appointment", "id")
    assert_equal hold_id, response.parsed_body.dig("appointment", "schedule_hold_id")
    assert_equal "converted", Clinic::Scheduling::ScheduleHold.find(hold_id).state
    post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal appointment_id, response.parsed_body.dig("appointment", "id")
    assert_equal 1, @practice.appointments.where(schedule_hold_id: hold_id).count
    get_calendar
    assert_empty day.fetch("holds")
    assert_equal 1, day.fetch("scheduled")

    booking[:appointment][:request_key] = "stale-held-booking"
    post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 1, @practice.appointments.where(schedule_hold_id: hold_id).count
  end

  test "expired hold frees capacity and exact hold retry does not create another" do
    expiry = Current.business_time + 1.minute
    hold_input = { hold: { request_key: "expiring-held-slot", patient_id: @patient.id,
      site_id: @site.id, clinician_id: @clinician.id, starts_at: @start.iso8601,
      ends_at: (@start + 30.minutes).iso8601, expires_at: expiry.iso8601 } }
    post "/api/clinic/schedule_holds", params: hold_input, headers: csrf_headers, as: :json
    assert_response :created
    hold_id = response.parsed_body.dig("hold", "id")
    travel_to expiry + 1.second do
      get_calendar
      assert_empty day.fetch("holds")
      assert_equal 2, day.fetch("available")
      booking = { appointment: { patient_id: @patient.id, site_id: @site.id,
        booked_clinician_id: @clinician.id, visit_type_id: @type.id, schedule_hold_id: hold_id,
        starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601,
        request_key: "book-expired-hold" } }
      post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      assert_empty @practice.appointments.where(schedule_hold_id: hold_id)
      post "/api/clinic/schedule_holds", params: hold_input, headers: csrf_headers, as: :json
      assert_response :created
      assert_equal hold_id, response.parsed_body.dig("hold", "id")
      assert_equal 1, Clinic::Scheduling::ScheduleHold.where(practice: @practice, request_key: "expiring-held-slot").count
    end
  end

  test "held slots scope patient identity and deny wrong site or missing permission" do
    input = { hold: { request_key: "scoped-held-slot", patient_id: @patient.id,
      site_id: @site.id, clinician_id: @clinician.id, starts_at: @start.iso8601,
      ends_at: (@start + 30.minutes).iso8601,
      expires_at: (Current.business_time + 10.minutes).iso8601 } }
    post "/api/clinic/schedule_holds", params: input, headers: csrf_headers, as: :json
    assert_response :created
    hold = response.parsed_body.fetch("hold")
    other_site = @practice.sites.create!(code: "SECOND")
    other_patient = @practice.patients.create!(display_name: "Different Synthetic Patient", reference: "OTHER-HOLD")
    booking = { appointment: { patient_id: other_patient.id, site_id: other_site.id,
      booked_clinician_id: @clinician.id, visit_type_id: @type.id, schedule_hold_id: hold.fetch("id"),
      starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601,
      request_key: "wrong-held-context" } }
    post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_empty @practice.appointments

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "appointments.read")
    get_calendar
    assert_nil day.fetch("holds").sole.fetch("patient_id")
    assert_nil day.fetch("holds").sole.fetch("patient_name")
    post "/api/clinic/schedule_holds", params: input.deep_merge(hold: { request_key: "unauthorized-hold" }), headers: csrf_headers, as: :json
    assert_response :forbidden
    post "/api/clinic/schedule_holds/#{hold.fetch('id')}/release",
      params: { hold: { request_key: "unauthorized-release", lock_version: hold.fetch("lock_version") } },
      headers: csrf_headers, as: :json
    assert_response :forbidden
    booking[:appointment][:patient_id] = @patient.id
    booking[:appointment][:site_id] = @site.id
    post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
    assert_response :forbidden

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "appointments.book", "appointments.read", "patients.read", scope_kind: "site", site: @site)
    other_site_hold = input.deep_merge(hold: { request_key: "wrong-site-hold", site_id: other_site.id })
    post "/api/clinic/schedule_holds", params: other_site_hold, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_empty Clinic::Scheduling::ScheduleHold.where(practice: @practice, site: other_site)
  end

  test "a capacity block keeps overlapping appointments visible and prevents only new bookings" do
    grant_permissions!(@membership, "facilities.write")
    get "/api/clinic/capacity", headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.fetch("can_block")
    finish = @start + 30.minutes
    booking = { appointment: { patient_id: @patient.id, site_id: @site.id,
      booked_clinician_id: @clinician.id, visit_type_id: @type.id,
      starts_at: @start.iso8601, ends_at: finish.iso8601, request_key: "book-before-closure" } }
    post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
    assert_response :created
    appointment_id = response.parsed_body.fetch("appointment").fetch("id")

    original_attributes = @practice.appointments.find(appointment_id).attributes
    block = { capacity: { request_key: "block-over-booking", site_id: @site.id,
      clinician_id: @clinician.id, kind: "block", starts_at: @start.iso8601,
      ends_at: finish.iso8601, reason: "Synthetic clinic closure" } }
    assert_difference -> { Clinic::Scheduling::CapacityRule.where(practice: @practice, kind: "block").count }, 1 do
      post "/api/clinic/capacity", params: block, headers: csrf_headers, as: :json
      assert_response :created
      assert_equal [ appointment_id ], response.parsed_body.fetch("affected_appointments").map { |item| item.fetch("id") }
    end
    block_id = response.parsed_body.fetch("rule").fetch("id")
    assert_equal original_attributes, @practice.appointments.find(appointment_id).attributes
    get "/api/clinic/capacity", headers: @headers
    assert_response :success
    persisted_block = response.parsed_body.fetch("rules").find { |rule| rule.fetch("id") == block_id }
    assert_equal "Synthetic clinic closure", persisted_block.fetch("reason")
    assert_equal @start, Time.iso8601(persisted_block.fetch("starts_at"))
    assert_equal finish, Time.iso8601(persisted_block.fetch("ends_at"))

    post "/api/clinic/capacity", params: block, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal [ appointment_id ], response.parsed_body.fetch("affected_appointments").map { |item| item.fetch("id") }
    assert_equal 1, Clinic::Scheduling::CapacityRule.where(practice: @practice, kind: "block").count

    second_patient = @practice.patients.create!(display_name: "Synthetic Closure Patient", reference: "CAL-CLOSURE")
    blocked_booking = { appointment: booking.fetch(:appointment).merge(
      patient_id: second_patient.id, request_key: "book-during-closure") }
    assert_no_difference -> { @practice.appointments.count } do
      post "/api/clinic/appointments", params: blocked_booking, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
    assert_match "blocked time", response.parsed_body.fetch("error")

    later_booking = { appointment: blocked_booking.fetch(:appointment).merge(
      starts_at: finish.iso8601, ends_at: (finish + 30.minutes).iso8601,
      request_key: "book-after-closure") }
    assert_difference -> { @practice.appointments.count }, 1 do
      post "/api/clinic/appointments", params: later_booking, headers: csrf_headers, as: :json
    end
    assert_response :created
    get_calendar
    assert_equal 2, day.fetch("scheduled")

    post "/api/clinic/capacity/#{block_id}/deactivate", params: {
      capacity: { expected_version: persisted_block.fetch("version") }
    }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal false, Clinic::Scheduling::CapacityRule.find(block_id).active
    get "/api/clinic/capacity", headers: @headers
    assert_response :success
    assert_not_includes response.parsed_body.fetch("rules").pluck("id"), block_id
    assert_equal original_attributes, @practice.appointments.find(appointment_id).reload.attributes

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "appointments.read")
    get "/api/clinic/capacity", headers: @headers
    assert_response :success
    assert_equal false, response.parsed_body.fetch("can_block")
    post "/api/clinic/capacity", params: { capacity: block.fetch(:capacity).merge(request_key: "unauthorized-block") },
      headers: csrf_headers, as: :json
    assert_response :forbidden
  end

  test "Muse 99 blocked time requires a reason and positive interval without persisting invalid rules" do
    grant_permissions!(@membership, "facilities.write")
    base = { site_id: @site.id, clinician_id: @clinician.id, kind: "block",
      starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601, reason: "Synthetic block" }
    [ base.merge(reason: " "), base.merge(ends_at: @start.iso8601),
      base.merge(ends_at: (@start - 30.minutes).iso8601) ].each_with_index do |invalid, index|
      assert_no_difference [ -> { Clinic::Scheduling::CapacityRule.count }, -> { @practice.appointments.count } ] do
        post "/api/clinic/capacity", params: { capacity: invalid.merge(request_key: "invalid-block-#{index}") },
          headers: csrf_headers, as: :json
        assert_response :unprocessable_entity
      end
    end
  end

  test "Muse 101 no show persists through appointment and list readback with eligibility enforced" do
    %w[scheduled confirmed].each do |status|
      appointment = @practice.appointments.create!(patient: @patient, site: @site, booked_clinician: @clinician,
        visit_type: @type, starts_at: Current.business_time - 30.minutes,
        ends_at: Current.business_time, status: status)
      original = appointment.attributes.except("status", "updated_at")
      post "/api/clinic/appointments/#{appointment.id}/transition", params: {
        transition: { to: "no_show", expected_status: status }
      }, headers: csrf_headers, as: :json
      assert_response :success
      get "/api/clinic/appointments/#{appointment.id}", headers: @headers
      assert_response :success
      assert_equal "no_show", response.parsed_body.fetch("appointment").fetch("status")
      get "/api/clinic/appointments", params: { patient_id: @patient.id }, headers: @headers
      assert_response :success
      row = response.parsed_body.fetch("appointments").find { |item| item.fetch("id") == appointment.id }
      assert_equal "no_show", row.fetch("status")
      assert_equal original, appointment.reload.attributes.except("status", "updated_at")
    end
    future = @practice.appointments.create!(patient: @patient, site: @site, booked_clinician: @clinician,
      visit_type: @type, starts_at: Current.business_time + 1.hour, ends_at: Current.business_time + 90.minutes, status: "scheduled")
    post "/api/clinic/appointments/#{future.id}/transition", params: {
      transition: { to: "no_show", expected_status: "scheduled" }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "scheduled", future.reload.status
  end

  test "a room hold blocks another clinician's booking and hold until released" do
    room = @site.rooms.create!(practice: @practice, code: "HELD-ROOM")
    other_user = User.create!(email_address: "other-calendar-clinician@example.invalid", password: SecureRandom.hex(18))
    other_membership = @practice.memberships.create!(user: other_user)
    other_clinician = @practice.clinician_profiles.create!(membership: other_membership, display_name: "Other clinician")
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: other_clinician,
      kind: "weekly", weekday: @date.wday, start_minute: 540, end_minute: 600, active: true)
    finish = @start + 30.minutes
    post "/api/clinic/schedule_holds",
      params: { hold: { request_key: "room-held-first", patient_id: @patient.id,
        site_id: @site.id, clinician_id: @clinician.id, room_id: room.id,
        starts_at: @start.iso8601, ends_at: finish.iso8601,
        expires_at: (Current.business_time + 30.minutes).iso8601 } },
      headers: csrf_headers, as: :json
    assert_response :created
    hold = response.parsed_body.fetch("hold")

    assert_no_difference -> { Clinic::Scheduling::ScheduleHold.where(practice: @practice).count } do
      post "/api/clinic/schedule_holds",
        params: { hold: { request_key: "room-held-second", site_id: @site.id,
          clinician_id: other_clinician.id, room_id: room.id, starts_at: @start.iso8601,
          ends_at: finish.iso8601, expires_at: (Current.business_time + 30.minutes).iso8601 } },
        headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity

    booking = { appointment: { patient_id: @patient.id, site_id: @site.id,
      booked_clinician_id: other_clinician.id, room_id: room.id, visit_type_id: @type.id,
      starts_at: @start.iso8601, ends_at: finish.iso8601, request_key: "room-held-booking" } }
    assert_no_difference -> { @practice.appointments.count } do
      post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity

    post "/api/clinic/schedule_holds/#{hold.fetch('id')}/release",
      params: { hold: { request_key: "room-held-release", lock_version: hold.fetch("lock_version") } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_difference -> { @practice.appointments.count }, 1 do
      post "/api/clinic/appointments", params: booking, headers: csrf_headers, as: :json
    end
    assert_response :created
  end

  test "simultaneous hold requests reserve one clinician and room interval and replay the outcome" do
    room = @site.rooms.create!(practice: @practice, code: "RACE-ROOM")
    finish = @start + 30.minutes
    expires_at = Current.business_time + 30.minutes
    ready = Queue.new
    release = Queue.new

    workers = 2.times.map do |index|
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          session = ActionDispatch::Integration::Session.new(Rails.application)
          session.host! "localhost:3000"
          session_headers = @headers.dup
          session.get "/api/csrf", headers: session_headers
          login_token = session.response.parsed_body.fetch("csrf_token")
          session.post "/api/session",
            params: { email_address: @user.email_address, password: @password },
            headers: session_headers.merge("X-CSRF-Token" => login_token), as: :json
          raise "Synthetic schedule race session login failed" unless session.response.successful?

          session.get "/api/csrf", headers: session_headers
          token = session.response.parsed_body.fetch("csrf_token")
          request_key = "calendar-hold-race-#{index}"
          params = { hold: { request_key: request_key, patient_id: @patient.id,
            site_id: @site.id, clinician_id: @clinician.id, room_id: room.id,
            starts_at: @start.iso8601, ends_at: finish.iso8601, expires_at: expires_at.iso8601 } }
          headers = session_headers.merge("X-CSRF-Token" => token)

          ready << true
          release.pop
          session.post "/api/clinic/schedule_holds", params:, headers:, as: :json
          first_status = session.response.status
          first_body = session.response.parsed_body

          session.get "/api/csrf", headers: session_headers
          retry_headers = session_headers.merge("X-CSRF-Token" => session.response.parsed_body.fetch("csrf_token"))
          session.post "/api/clinic/schedule_holds", params:, headers: retry_headers, as: :json
          retry_status = session.response.status
          retry_body = session.response.parsed_body

          { request_key:, first_status:, first_body:, retry_status:, retry_body: }
        end
      end
    end

    2.times { ready.pop }
    2.times { release << true }
    results = workers.map(&:value)

    assert_equal [ 201, 422 ], results.map { |result| result.fetch(:first_status) }.sort
    winner = results.find { |result| result.fetch(:first_status) == 201 }
    loser = results.find { |result| result.fetch(:first_status) == 422 }
    assert_equal 201, winner.fetch(:retry_status)
    assert_equal winner.dig(:first_body, "hold", "id"), winner.dig(:retry_body, "hold", "id")
    assert_equal 422, loser.fetch(:retry_status)
    assert_match "held pending booking", loser.dig(:retry_body, "error")

    holds = Clinic::Scheduling::ScheduleHold.where(practice: @practice, site: @site, room:, starts_at: @start)
    assert_equal 1, holds.count
    assert_equal "active", holds.sole.state
    assert_equal winner.fetch(:request_key), holds.sole.request_key
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: winner.fetch(:request_key)).count
  ensure
    workers&.each { |worker| worker.kill if worker.alive? }
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
