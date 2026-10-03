require "test_helper"

class ClinicSchedulingPolicySeriesTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @password = SecureRandom.hex(20)
    @user = User.create!(email_address: "scheduling-policy@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic Scheduling Policy", timezone: "America/Chicago")
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "appointments.read", "appointments.book",
      "appointments.status_transition", "facilities.read", "facilities.write")
    @site = @practice.sites.create!(code: "POLICY", status: "active")
    @room_one = @site.rooms.create!(practice: @practice, code: "Room 1", kind: "physical")
    @room_two = @site.rooms.create!(practice: @practice, code: "Room 2", kind: "physical")
    @clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Synthetic Clinician")
    @patient_one = @practice.patients.create!(display_name: "Synthetic One", reference: "SCHED-ONE")
    @patient_two = @practice.patients.create!(display_name: "Synthetic Two", reference: "SCHED-TWO")
    @patient_three = @practice.patients.create!(display_name: "Synthetic Three", reference: "SCHED-THREE")
    @visit_type = @practice.visit_types.create!(code: "Follow up")
    Development::GuidedClinicDemo.configure_site_profile!(practice: @practice, site: @site, membership: @membership,
      clinic_type: "primary_care", request_key: "series-original-profile", finalize: true)
    @start = ActiveSupport::TimeZone[@practice.timezone].local(2026, 11, 4, 9)
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: @start.wday, start_minute: 540, end_minute: 660, active: true)
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  test "site policy starts off, saves a revision, and rejects stale and unauthorized edits" do
    get policy_path, headers: headers
    assert_response :success
    assert_equal 0, response.parsed_body.dig("policy", "revision")
    assert_equal false, response.parsed_body.dig("policy", "recurrence_enabled")

    patch policy_path, params: policy_body(recurrence: true), headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 1, response.parsed_body.dig("policy", "revision")
    patch policy_path, params: policy_body(recurrence: false), headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 1, Clinic::Scheduling::SitePolicy.where(site: @site).count

    other = User.create!(email_address: "scheduling-policy-denied@example.invalid", password: SecureRandom.hex(20))
    other_membership = @practice.memberships.create!(user: other)
    grant_permissions!(other_membership, "facilities.read", "appointments.book")
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Scheduling::SitePolicy.save_revision!(practice: @practice, site: @site, actor: other,
        expected_revision: 1, recurrence_enabled: false, overbook_enabled: false,
        eligible_visit_type_ids: [])
    end
  end

  test "weekly series commits atomically and exact retry does not duplicate visits" do
    enable_policy(recurrence: true)
    input = series_body(request_key: "synthetic-series-create")
    post "/api/clinic/appointment_series/preview", params: input, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal [ nil, nil ], response.parsed_body.fetch("occurrences").map { |row| row["conflict"] }

    assert_difference -> { @practice.appointments.count }, 2 do
      2.times do
        post "/api/clinic/appointment_series", params: input, headers: csrf_headers, as: :json
        assert_response :created
      end
    end
    assert_equal 1, Clinic::Scheduling::AppointmentSeries.where(practice: @practice).count
    assert_equal [ 1, 2 ], Clinic::Scheduling::AppointmentSeriesOccurrence.where(practice: @practice).order(:sequence).pluck(:sequence)

    conflicting = series_body(request_key: "synthetic-series-conflict", patient_id: @patient_two.id)
    assert_no_difference -> { @practice.appointments.count } do
      post "/api/clinic/appointment_series", params: conflicting, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
  end

  test "future series visits can be previewed changed and cancelled with exact retry" do
    enable_policy(recurrence: true)
    post "/api/clinic/appointment_series", params: series_body(request_key: "editable-series"),
      headers: csrf_headers, as: :json
    assert_response :created
    series = response.parsed_body.fetch("series")
    id = series.fetch("id")
    versions = series.fetch("occurrences").filter_map do |row|
      { appointment_id: row.fetch("appointment_id"), updated_at: row.fetch("updated_at") } if row["appointment_id"]
    end

    post "/api/clinic/appointment_series/#{id}/preview_change",
      params: { change: { from_sequence: 1, local_time: "10:00" } },
      headers: csrf_headers, as: :json
    assert_response :success
    assert_equal [ nil, nil ], response.parsed_body.fetch("occurrences").map { |row| row["conflict"] }

    change = { change: { from_sequence: 1, local_time: "10:00", reason: "Synthetic time change",
      expected_versions: versions, request_key: "change-series-time" } }
    2.times do
      post "/api/clinic/appointment_series/#{id}/change_future", params: change,
        headers: csrf_headers, as: :json
      assert_response :success
    end
    changed = @practice.appointments.where(id: versions.pluck(:appointment_id)).order(:starts_at)
    assert_equal [ 10, 10 ], changed.map { |visit| visit.starts_at.in_time_zone(@practice.timezone).hour }
    assert_equal 1, Clinic::Scheduling::AppointmentSeriesChange.where(series_id: id).count

    get "/api/clinic/appointment_series/#{id}", headers: headers
    assert_response :success
    future = response.parsed_body.fetch("series").fetch("occurrences").last
    patch policy_path, params: { policy: { expected_revision: 1,
      recurrence_enabled: false, overbook_enabled: false, eligible_visit_type_ids: [] } },
      headers: csrf_headers, as: :json
    assert_response :success
    post "/api/clinic/appointment_series/#{id}/preview_change",
      params: { change: { from_sequence: 2, local_time: "10:30" } },
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    cancel = { cancel: { from_sequence: 2, reason: "Synthetic cancellation",
      request_key: "cancel-series-future",
      cancellation_message_acknowledged: true,
      expected_versions: [ { appointment_id: future.fetch("appointment_id"),
        updated_at: future.fetch("updated_at") } ] } }
    2.times do
      post "/api/clinic/appointment_series/#{id}/cancel_future", params: cancel,
        headers: csrf_headers, as: :json
      assert_response :success
    end
    assert_equal "cancelled", @practice.appointments.find(future.fetch("appointment_id")).status
    assert_equal "scheduled", @practice.appointments.find(versions.first.fetch(:appointment_id)).status
    assert_equal %w[change_future cancel_future],
      Clinic::Scheduling::AppointmentSeriesChange.where(series_id: id).order(:id).pluck(:action)
  end

  test "future series previews use a reassigned occurrence's current site and clinician" do
    series, moved, other_clinician, other_site = reassigned_series
    @practice.appointments.create!(patient: @patient_two, site: @site, booked_clinician: @clinician,
      visit_type: @visit_type, room: @room_one, starts_at: @start + 1.hour, ends_at: @start + 90.minutes,
      status: "scheduled", visit_modality: "in_person")

    rows = Clinic::Scheduling::ManageSeries.preview_change(series: series, actor: @user,
      from_sequence: 1, local_time: "10:00")

    assert rows.all? { |row| row[:conflict].nil? }
    Clinic::Scheduling::ManageSeries.change_future(series: series, actor: @user, from_sequence: 1,
      local_time: "10:00", room: nil, reason: "Synthetic current assignment change",
      expected_versions: rows.map { |row| { appointment_id: row[:appointment_id], updated_at: row[:expected_updated_at].iso8601(6) } },
      request_key: "reassigned-series-change")
    moved.reload
    assert_equal other_site.id, moved.site_id
    assert_equal other_clinician.id, moved.booked_clinician_id
    assert_equal @start + 1.hour, moved.starts_at
  end

  test "future series preview reports conflicts on the reassigned clinician" do
    series, moved, other_clinician, other_site = reassigned_series
    @practice.appointments.create!(patient: @patient_two, site: other_site, booked_clinician: other_clinician,
      visit_type: @visit_type, starts_at: @start + 1.hour, ends_at: @start + 90.minutes,
      status: "scheduled", visit_modality: "in_person")

    rows = Clinic::Scheduling::ManageSeries.preview_change(series: series, actor: @user,
      from_sequence: 1, local_time: "10:00")

    assert_match "clinician is already booked", rows.find { |row| row[:appointment_id] == moved.id }.fetch(:conflict)
  end

  test "a daylight saving gap is shown as a conflict instead of shifting the series" do
    enable_policy(recurrence: true)
    first = ActiveSupport::TimeZone[@practice.timezone].local(2027, 3, 7, 2, 30)
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: first.wday, start_minute: 120, end_minute: 180, active: true)
    input = series_body(request_key: "dst-preview")
    input[:series][:starts_at] = first.iso8601
    input[:series][:ends_at] = (first + 30.minutes).iso8601
    post "/api/clinic/appointment_series/preview", params: input, headers: csrf_headers, as: :json
    assert_response :success
    rows = response.parsed_body.fetch("occurrences")
    assert_nil rows.first.fetch("conflict")
    assert_match(/missing or ambiguous/, rows.last.fetch("conflict"))
    assert_no_difference -> { @practice.appointments.count } do
      post "/api/clinic/appointment_series", params: input, headers: csrf_headers, as: :json
    end
    assert_response :unprocessable_entity
  end

  test "a moved occurrence keeps its original date and change reason" do
    enable_policy(recurrence: true)
    input = series_body(request_key: "moved-occurrence")
    input[:series][:resolutions] = [ { sequence: 2,
      starts_at: (@start + 1.week + 1.hour).iso8601,
      change_reason: "Synthetic clinician request" } ]
    post "/api/clinic/appointment_series/preview", params: input, headers: csrf_headers, as: :json
    assert_response :success
    assert_nil response.parsed_body.fetch("occurrences").last.fetch("conflict")
    post "/api/clinic/appointment_series", params: input, headers: csrf_headers, as: :json
    assert_response :created
    occurrence = Clinic::Scheduling::AppointmentSeriesOccurrence.where(practice: @practice, sequence: 2).last
    assert_equal "Synthetic clinician request", occurrence.change_reason
    assert_equal (@start + 1.week).to_date, occurrence.original_date
    assert_equal 10, occurrence.appointment.starts_at.in_time_zone(@practice.timezone).hour
  end

  test "a conflict in one future visit rolls back the entire series change" do
    enable_policy(recurrence: true)
    post "/api/clinic/appointment_series", params: series_body(request_key: "atomic-change-series"),
      headers: csrf_headers, as: :json
    assert_response :created
    series = response.parsed_body.fetch("series")
    first_id = series.fetch("occurrences").first.fetch("appointment_id")
    original = @practice.appointments.find(first_id).starts_at
    blocker = booking_body(@patient_two, @room_two, "future-change-blocker")
    blocker[:appointment][:starts_at] = (@start + 1.week + 90.minutes).iso8601
    blocker[:appointment][:ends_at] = (@start + 1.week + 120.minutes).iso8601
    post "/api/clinic/appointments", params: blocker, headers: csrf_headers, as: :json
    assert_response :created
    versions = series.fetch("occurrences").map do |row|
      { appointment_id: row.fetch("appointment_id"), updated_at: row.fetch("updated_at") }
    end
    post "/api/clinic/appointment_series/#{series.fetch('id')}/change_future",
      params: { change: { from_sequence: 1, local_time: "10:30",
        reason: "Synthetic change attempt", expected_versions: versions,
        request_key: "atomic-change-rejected" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal original, @practice.appointments.find(first_id).starts_at
    assert_equal 0, Clinic::Scheduling::AppointmentSeriesChange.where(series_id: series.fetch("id")).count
  end

  test "overbook needs separate permission and policy and never doubles patient or room" do
    enable_policy(overbook: true)
    first = book(patient: @patient_one, room: @room_one, key: "first-book")
    assert_equal false, first.fetch("overbooked")
    post "/api/clinic/appointments", params: booking_body(@patient_two, @room_two, "denied-overbook", overbook: true),
      headers: csrf_headers, as: :json
    assert_response :forbidden
    grant_permissions!(@membership, "appointments.overbook")

    second = book(patient: @patient_two, room: @room_two, key: "approved-overbook", overbook: true)
    assert_equal true, second.fetch("overbooked")
    assert_equal 2, @practice.appointments.find(second.fetch("id")).clinician_allocation
    assert_equal 1, Clinic::Scheduling::OverbookException.where(appointment_id: second.fetch("id")).count
    assert_equal [ first.fetch("id") ], Clinic::Scheduling::OverbookException.find_by!(appointment_id: second.fetch("id")).conflicting_appointment_ids

    post "/api/clinic/appointments", params: booking_body(@patient_three, @room_two, "third-overbook", overbook: true),
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    post "/api/clinic/appointments", params: booking_body(@patient_one, @room_two, "same-patient", overbook: true),
      headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_equal 2, @practice.appointments.count
  end

  private

  def reassigned_series
    enable_policy(recurrence: true)
    post "/api/clinic/appointment_series", params: series_body(request_key: "reassigned-series"),
      headers: csrf_headers, as: :json
    assert_response :created
    series = Clinic::Scheduling::AppointmentSeries.find(response.parsed_body.dig("series", "id"))
    other_site = @practice.sites.create!(code: "REASSIGNED", status: "active")
    Development::GuidedClinicDemo.configure_site_profile!(practice: @practice, site: other_site, membership: @membership,
      clinic_type: "primary_care", request_key: "series-reassigned-profile", finalize: true)
    other_user = User.create!(email_address: "reassigned-series-clinician@example.invalid", password: SecureRandom.hex(20))
    other_membership = @practice.memberships.create!(user: other_user)
    other_clinician = @practice.clinician_profiles.create!(membership: other_membership, display_name: "Synthetic Reassigned Clinician")
    other_room = other_site.rooms.create!(practice: @practice, code: "REASSIGNED-ROOM", kind: "physical")
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: other_site, clinician: other_clinician,
      kind: "weekly", weekday: @start.wday, start_minute: 540, end_minute: 660, active: true)
    moved = series.occurrences.order(:sequence).first.appointment
    Clinic::Scheduling::RescheduleAppointment.call(appointment: moved, actor: @user, starts_at: moved.starts_at,
      ends_at: moved.ends_at, site: other_site, booked_clinician: other_clinician, room: other_room,
      expected_updated_at: moved.updated_at, request_key: "reassign-series-occurrence")
    [ series, moved, other_clinician, other_site ]
  end

  def headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
  def policy_path = "/api/clinic/facilities/#{@site.id}/scheduling_policy"

  def csrf_headers
    get "/api/csrf", headers: headers
    headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def policy_body(recurrence: false, overbook: false)
    { policy: { expected_revision: 0, recurrence_enabled: recurrence, overbook_enabled: overbook,
      eligible_visit_type_ids: overbook ? [ @visit_type.id ] : [] } }
  end

  def enable_policy(recurrence: false, overbook: false)
    patch policy_path, params: policy_body(recurrence: recurrence, overbook: overbook), headers: csrf_headers, as: :json
    assert_response :success
  end

  def series_body(request_key:, patient_id: @patient_one.id)
    { series: { patient_id: patient_id, site_id: @site.id, room_id: @room_one.id,
      booked_clinician_id: @clinician.id, visit_type_id: @visit_type.id,
      starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601,
      visit_modality: "in_person", interval_weeks: 1, occurrence_count: 2,
      expected_policy_revision: 1, resolutions: [], request_key: request_key } }
  end

  def booking_body(patient, room, key, overbook: false)
    { appointment: { patient_id: patient.id, site_id: @site.id, room_id: room.id,
      booked_clinician_id: @clinician.id, visit_type_id: @visit_type.id,
      starts_at: @start.iso8601, ends_at: (@start + 30.minutes).iso8601, request_key: key,
      **(overbook ? { overbook_reason: "Synthetic same-day need", expected_policy_revision: 1 } : {}) } }
  end

  def book(patient:, room:, key:, overbook: false)
    post "/api/clinic/appointments", params: booking_body(patient, room, key, overbook: overbook),
      headers: csrf_headers, as: :json
    assert_response :created
    response.parsed_body.fetch("appointment")
  end
end
