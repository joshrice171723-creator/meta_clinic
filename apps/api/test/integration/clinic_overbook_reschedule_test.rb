require "test_helper"

class ClinicOverbookRescheduleTest < ActionDispatch::IntegrationTest
  require Rails.root.join("db/migrate/20260930204800_allow_append_only_reschedule_overbook_exceptions").to_s
  setup do
    host! "localhost:3000"
    password = SecureRandom.hex(20)
    @user = User.create!(email_address: "overbook-reschedule@example.invalid", password: password)
    @practice = Clinic::Practice.create!(name: "Synthetic Reschedule", timezone: "America/Chicago")
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "appointments.read", "appointments.book", "facilities.read", "facilities.write")
    @site = @practice.sites.create!(code: "RESCHEDULE", status: "active")
    @rooms = 3.times.map { |index| @site.rooms.create!(practice: @practice, code: "Room #{index}", kind: "physical") }
    @clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Synthetic Clinician")
    @patients = 3.times.map { |index| @practice.patients.create!(display_name: "Synthetic Reschedule #{index}", reference: "RESCHEDULE-#{index}") }
    @visit_type = @practice.visit_types.create!(code: "Synthetic follow up")
    @start = ActiveSupport::TimeZone[@practice.timezone].local(2026, 11, 4, 9)
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: @start.wday, start_minute: 540, end_minute: 660, active: true)
    post "/api/session", params: { email_address: @user.email_address, password: password }, headers: csrf_headers, as: :json
    assert_response :success
    @blocker = booking(patient: @patients[0], room: @rooms[0], starts_at: @start)
    @moving = booking(patient: @patients[1], room: @rooms[1], starts_at: @start + 30.minutes)
  end

  test "reasoned reschedule uses the spare allocation and retries once without changing other visits" do
    enable_overbook
    grant_permissions!(@membership, "appointments.overbook")
    blocker_before = @blocker.attributes
    input = reschedule_body
    2.times do
      patch_appointment(input)
      assert_response :success
      assert_equal "Synthetic reschedule reason", response.parsed_body.dig("appointment", "overbook_reason")
    end

    assert_equal 2, @moving.reload.clinician_allocation
    assert_equal blocker_before, @blocker.reload.attributes
    assert_equal 2, @practice.appointments.count
    exception = @moving.overbook_exception
    assert_equal 1, @moving.overbook_exceptions.count
    assert_equal [ @blocker.id ], exception.conflicting_appointment_ids
    assert_equal 1, exception.policy_revision
    assert_equal @membership.id, exception.written_by_membership_id
    assert_equal @site.id, exception.site_id

    changed = Marshal.load(Marshal.dump(input))
    changed[:appointment][:overbook_reason] = "Changed replay reason"
    patch_appointment(changed)
    assert_response :conflict
    assert_equal 1, @moving.overbook_exceptions.count
  end

  test "another overbook reschedule appends history and ordinary moves preserve old exceptions" do
    enable_overbook
    grant_permissions!(@membership, "appointments.overbook")
    patch_appointment(reschedule_body)
    assert_response :success
    original_exception = @moving.reload.overbook_exception
    original_attributes = original_exception.attributes

    patch_appointment(reschedule_body(starts_at: @start + 30.minutes, key: "ordinary-move", overbook: false))
    assert_response :success
    assert_equal 1, @moving.reload.clinician_allocation
    assert_equal 1, @moving.overbook_exceptions.count
    assert_equal original_attributes, original_exception.reload.attributes

    input = reschedule_body(key: "second-exception")
    input[:appointment][:overbook_reason] = "Another synthetic reason"
    patch_appointment(input)
    assert_response :success
    assert_equal "Another synthetic reason", response.parsed_body.dig("appointment", "overbook_reason")
    assert_equal 2, @moving.reload.clinician_allocation
    assert_equal 2, @moving.overbook_exceptions.count
    assert_not_equal original_exception.id, @moving.overbook_exception.id
    assert_equal original_attributes, original_exception.reload.attributes
    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Scheduling::OverbookException.transaction(requires_new: true) { original_exception.update!(policy_revision: 2) }
    end
    assert_raises(ActiveRecord::IrreversibleMigration) { AllowAppendOnlyRescheduleOverbookExceptions.new.down }
    index = ActiveRecord::Base.connection.indexes(:clinic_appointment_overbook_exceptions)
      .find { |item| item.name == "clinic_appointment_overbook_exception_appointment" }
    assert_not index.unique
    assert_equal 2, @moving.overbook_exceptions.count
  end

  test "exception execution requires permission including on committed replay" do
    enable_overbook
    input = reschedule_body
    before = @moving.attributes
    patch_appointment(input)
    assert_response :forbidden
    assert_equal before, @moving.reload.attributes
    assert_equal 0, @moving.overbook_exceptions.count
    grant_permissions!(@membership, "appointments.overbook")
    patch_appointment(input)
    assert_response :success
    set_permission!(@membership, "appointments.overbook", false)
    patch_appointment(input)
    assert_response :forbidden
    assert_equal 1, @moving.overbook_exceptions.count
    assert_equal 2, @moving.reload.clinician_allocation
  end

  test "missing reason stale or disabled policy and ineligible type leave the visit untouched" do
    enable_overbook
    grant_permissions!(@membership, "appointments.overbook")
    original = @moving.attributes
    inputs = [
      reschedule_body(key: "blank-reason"),
      reschedule_body(key: "stale-policy"),
      reschedule_body(key: "ineligible-type"),
      reschedule_body(key: "no-revision"),
      reschedule_body(key: "no-physical-room")
    ]
    inputs[0][:appointment][:overbook_reason] = " "
    inputs[1][:appointment][:expected_policy_revision] = 0
    inputs[2][:appointment][:visit_type_id] = @practice.visit_types.create!(code: "Other type").id
    inputs[3][:appointment].delete(:expected_policy_revision)
    inputs[4][:appointment][:room_id] = nil
    inputs.each do |input|
      patch_appointment(input)
      assert_response :unprocessable_entity
      assert_equal original, @moving.reload.attributes
      assert_equal 0, @moving.overbook_exceptions.count
    end
    Clinic::Scheduling::SitePolicy.save_revision!(practice: @practice, site: @site, actor: @user,
      expected_revision: 1, recurrence_enabled: false, overbook_enabled: false, eligible_visit_type_ids: [])
    input = reschedule_body(key: "disabled-policy")
    input[:appointment][:expected_policy_revision] = 2
    patch_appointment(input)
    assert_response :unprocessable_entity
    assert_equal original, @moving.reload.attributes
  end

  test "exception never bypasses room patient or second allocation conflicts" do
    enable_overbook
    grant_permissions!(@membership, "appointments.overbook")
    original = @moving.attributes
    input = reschedule_body(key: "same-room")
    input[:appointment][:room_id] = @rooms[0].id
    patch_appointment(input)
    assert_response :unprocessable_entity
    assert_equal original, @moving.reload.attributes
    patch_appointment(reschedule_body(key: "ordinary-overlap", overbook: false))
    assert_response :unprocessable_entity
    assert_equal original, @moving.reload.attributes

    other_user = User.create!(email_address: "other-reschedule@example.invalid", password: SecureRandom.hex(20))
    other_membership = @practice.memberships.create!(user: other_user)
    other_clinician = @practice.clinician_profiles.create!(membership: other_membership)
    patient_conflict = @practice.appointments.create!(patient: @patients[1], site: @site, room: @rooms[2],
      booked_clinician: other_clinician, starts_at: @start, ends_at: @start + 30.minutes, status: "scheduled")
    patch_appointment(reschedule_body(key: "same-patient"))
    assert_response :unprocessable_entity
    assert_equal original, @moving.reload.attributes
    patient_conflict.update!(status: "cancelled")

    patch_appointment(reschedule_body(key: "allowed-second"))
    assert_response :success
    third = booking(patient: @patients[2], room: @rooms[2], starts_at: @start + 1.hour)
    @moving = third
    original = third.attributes
    patch_appointment(reschedule_body(key: "third-allocation"))
    assert_response :unprocessable_entity
    assert_equal original, third.reload.attributes
    assert_equal 1, Clinic::Scheduling::OverbookException.where(practice: @practice).count
  end

  test "hours blocks holds and offers remain hard failures" do
    enable_overbook
    grant_permissions!(@membership, "appointments.overbook")
    original = @moving.attributes
    input = reschedule_body(starts_at: @start + 3.hours, key: "outside-capacity")
    patch_appointment(input)
    assert_response :unprocessable_entity
    @site.hour_exceptions.create!(practice: @practice, date: @start.in_time_zone(@practice.timezone).to_date,
      closed: true, reason: "Synthetic closure")
    patch_appointment(reschedule_body(key: "closed-site"))
    assert_response :unprocessable_entity
    assert_equal original, @moving.reload.attributes
    @site.hour_exceptions.first.destroy!

    block = Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "block", starts_at: @start, ends_at: @start + 30.minutes, reason: "Synthetic block", active: true)
    patch_appointment(reschedule_body(key: "blocked-time"))
    assert_response :unprocessable_entity
    block.update!(active: false)
    hold = Clinic::Scheduling::ScheduleHold.create!(practice: @practice, site: @site, clinician: @clinician,
      patient: @patients[2], room: @rooms[2], starts_at: @start, ends_at: @start + 30.minutes,
      expires_at: Current.business_time + 10.minutes, request_key: "synthetic-held-time")
    patch_appointment(reschedule_body(key: "held-time"))
    assert_response :unprocessable_entity
    hold.update!(state: "released")
    Clinic::Scheduling::WaitlistEntry.create!(practice: @practice, site: @site, clinician: @clinician,
      patient: @patients[2], visit_type: @visit_type, duration_minutes: 30,
      earliest_at: @start, latest_at: @start + 1.day,
      state: "offered", offer_starts_at: @start, offer_ends_at: @start + 30.minutes,
      offer_expires_at: Current.business_time + 10.minutes)
    patch_appointment(reschedule_body(key: "offered-time"))
    assert_response :unprocessable_entity
    assert_equal original, @moving.reload.attributes
    assert_equal 0, @moving.overbook_exceptions.count
  end

  private

  def headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }

  def csrf_headers
    get "/api/csrf", headers: headers
    headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def enable_overbook
    Clinic::Scheduling::SitePolicy.save_revision!(practice: @practice, site: @site, actor: @user,
      expected_revision: 0, recurrence_enabled: false, overbook_enabled: true, eligible_visit_type_ids: [ @visit_type.id ])
  end

  def booking(patient:, room:, starts_at:)
    Clinic::Scheduling::BookAppointment.call(practice: @practice, actor: @user, patient: patient,
      site: @site, room: room, booked_clinician: @clinician, visit_type: @visit_type,
      starts_at: starts_at, ends_at: starts_at + 30.minutes, request_key: SecureRandom.uuid)
  end

  def reschedule_body(starts_at: @start, key: "overbook-reschedule", overbook: true)
    { appointment: { site_id: @site.id, room_id: @moving.room_id,
      booked_clinician_id: @clinician.id, visit_type_id: @visit_type.id,
      starts_at: starts_at.iso8601, ends_at: (starts_at + 30.minutes).iso8601,
      expected_updated_at: @moving.reload.updated_at.iso8601(6), request_key: key,
      **(overbook ? { overbook_reason: "Synthetic reschedule reason", expected_policy_revision: 1 } : {}) } }
  end

  def patch_appointment(input)
    patch "/api/clinic/appointments/#{@moving.id}", params: input, headers: csrf_headers, as: :json
  end
end
