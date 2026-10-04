require "test_helper"

class Clinic::Scheduling::CalendarTest < ActiveSupport::TestCase
  setup do
    organization = Organization.create!(name: "Synthetic Calendar Organization")
    @practice = Clinic::Practice.create!(name: "Synthetic Calendar", organization: organization, timezone: "America/Chicago")
    @user = User.create!(email_address: "calendar@example.invalid", password: SecureRandom.hex(18))
    membership = @practice.memberships.create!(user: @user)
    @clinician = @practice.clinician_profiles.create!(membership: membership, display_name: "Calendar Clinician")
    @site = @practice.sites.create!(code: "MAIN", status: "active")
    @practice.visit_types.create!(code: "Synthetic calendar visit")
    configure_site!(@site, membership: membership)
    @room = @practice.rooms.create!(site: @site, code: "ONE")
    @patient = @practice.patients.create!(display_name: "Synthetic Calendar Patient", reference: "CAL-ONE")
    @date = Date.new(2026, 9, 16)
    @zone = ActiveSupport::TimeZone[@practice.timezone]
  end

  test "missing capacity is unknown rather than fabricated free time" do
    day = projection[:days].find { |d| d[:date] == @date.iso8601 }
    assert_nil day[:available]
    assert_empty day[:slots]
  end

  test "conditional P2 scheduling features remain explicit and read-only" do
    policy = projection.fetch(:policy)

    assert_equal "not_configured", policy[:recurrence]
    assert_equal "not_configured", policy[:overbook]
    assert_equal "read_only_export", policy[:external_sync]
  end

  test "uses the selected site's timezone for the calendar projection" do
    @site.update!(timezone_override: "UTC")
    weekly

    result = projection
    slot = result[:days].find { |d| d[:date] == @date.iso8601 }[:slots].first

    assert_equal "UTC", result[:timezone]
    assert_equal 9, Time.iso8601(slot[:starts_at]).hour
  end

  test "capacity subtracts bookings blocks and room reservations without duplicate slots" do
    2.times { weekly }
    appointment = @practice.appointments.create!(patient: @patient, site: @site, room: @room,
      booked_clinician: @clinician, starts_at: @zone.local(2026, 9, 16, 9), ends_at: @zone.local(2026, 9, 16, 9, 30), status: "scheduled")
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "block", starts_at: @zone.local(2026, 9, 16, 10), ends_at: @zone.local(2026, 9, 16, 10, 30), reason: "Unavailable", active: true)
    day = projection[:days].find { |d| d[:date] == @date.iso8601 }
    assert_equal 1, day[:scheduled]
    assert_equal 2, day[:available]
    assert_equal [ "09:30", "10:30" ], day[:slots].map { |s| Time.iso8601(s[:starts_at]).strftime("%H:%M") }
    assert_equal [ @room.id ], day[:slots].first[:room_ids]
    assert_equal appointment.id, day[:appointments].first[:id]
    assert_equal "Calendar Clinician", day[:appointments].first[:clinician_name]
  end

  test "active holds hide clinician capacity and held rooms until release or expiry" do
    travel_to @zone.local(2026, 9, 15, 12) do
      weekly
      other_user = User.create!(email_address: "calendar-other@example.invalid", password: SecureRandom.hex(18))
      other_membership = @practice.memberships.create!(user: other_user)
      other_clinician = @practice.clinician_profiles.create!(membership: other_membership, display_name: "Other Clinician")
      Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: other_clinician,
        kind: "weekly", weekday: @date.wday, start_minute: 540, end_minute: 660, active: true)
      hold = Clinic::Scheduling::ScheduleHold.create!(practice: @practice, patient: @patient, site: @site,
        clinician: @clinician, room: @room, starts_at: @zone.local(2026, 9, 16, 9),
        ends_at: @zone.local(2026, 9, 16, 9, 30), expires_at: @zone.local(2026, 9, 15, 13),
        request_key: SecureRandom.uuid)

      day = projection[:days].find { |row| row[:date] == @date.iso8601 }
      assert_equal 7, day[:available]
      assert_equal [other_clinician.id], day[:slots].select { |slot| Time.iso8601(slot[:starts_at]).strftime("%H:%M") == "09:00" }.map { |slot| slot[:clinician_id] }
      assert_empty day[:slots].first[:room_ids]

      hold.update!(state: "released")
      assert_equal 8, projection[:days].find { |row| row[:date] == @date.iso8601 }[:available]

      hold.update!(state: "active", expires_at: 1.minute.ago)
      assert_equal 8, projection[:days].find { |row| row[:date] == @date.iso8601 }[:available]
    end
  end

  test "deduplicated slots retain every source rule revision and one generation time" do
    first, second = weekly, weekly
    second.update!(end_minute: 630)
    # Unrelated site and inactive rules must never be reported as contributors.
    other_site = @practice.sites.create!(code: "OTHER")
    weekly.update!(site: other_site)
    weekly.update!(active: false)

    result = projection
    slots = result[:days].find { |d| d[:date] == @date.iso8601 }[:slots]
    assert_equal 4, slots.length
    assert_equal({ generated_at: result[:as_of], source_rules: [
      { id: first.id, version: first.lock_version },
      { id: second.id, version: second.lock_version }
    ] }, slots.first[:provenance])
    assert_equal [ { id: first.id, version: first.lock_version } ], slots.last[:provenance][:source_rules]
    assert slots.all? { |slot| slot[:provenance][:generated_at] == result[:as_of] }
    assert_equal [ @room.id ], slots.first[:room_ids]
  end

  test "a new projection reflects a changed rule revision without reserving capacity" do
    rule = weekly
    before = projection
    rule.update!(start_minute: 570)
    after = projection
    before_slots = before[:days].find { |d| d[:date] == @date.iso8601 }[:slots]
    after_slots = after[:days].find { |d| d[:date] == @date.iso8601 }[:slots]

    assert_equal 4, before_slots.length
    assert_equal 3, after_slots.length
    assert_equal 0, before_slots.first[:provenance][:source_rules].first[:version]
    assert_equal rule.lock_version, after_slots.first[:provenance][:source_rules].first[:version]
    assert_equal rule.id, after_slots.first[:provenance][:source_rules].first[:id]
    assert_equal 0, @practice.appointments.count
    assert_equal 0, Clinic::Scheduling::ScheduleHold.where(practice: @practice).count
  end

  test "serializing appointments preloads telehealth visits" do
    2.times do |index|
      @practice.appointments.create!(patient: @patient, site: @site, booked_clinician: @clinician,
        starts_at: @zone.local(2026, 9, 16, 9 + index), ends_at: @zone.local(2026, 9, 16, 9 + index, 30), status: "scheduled")
    end

    queries = []
    ActiveSupport::Notifications.subscribed(->(*args) { queries << args.last[:sql] }, "sql.active_record") do
      projection
    end

    assert_operator queries.count { |sql| sql.include?("FROM \"clinic_telehealth_visits\"") }, :<=, 1
  end

  test "location hours and exceptions constrain clinician capacity" do
    weekly
    @site.hour_exceptions.create!(practice: @practice, date: @date, closed: true, reason: "Closed")
    assert_equal 0, projection[:days].find { |d| d[:date] == @date.iso8601 }[:available]
  end

  test "cancelled bookings release capacity and encounter progress is explicit" do
    weekly
    appointment = @practice.appointments.create!(patient: @patient, site: @site, booked_clinician: @clinician,
      starts_at: @zone.local(2026, 9, 16, 9), ends_at: @zone.local(2026, 9, 16, 9, 30), status: "cancelled")
    day = projection[:days].find { |d| d[:date] == @date.iso8601 }
    assert_equal 4, day[:available]
    assert_equal "cancelled", day[:appointments].first[:calendar_status]
    appointment.update!(status: "confirmed")
    @practice.encounters.create!(patient: @patient, appointment: appointment, site: @site,
      started_at: appointment.starts_at, status: "open")
    assert_equal "checked_in", projection[:days].find { |d| d[:date] == @date.iso8601 }[:appointments].first[:calendar_status]
  end

  private

  def weekly
    Clinic::Scheduling::CapacityRule.create!(practice: @practice, site: @site, clinician: @clinician,
      kind: "weekly", weekday: @date.wday, start_minute: 540, end_minute: 660, active: true)
  end

  def projection
    Clinic::Scheduling::Calendar.new(practice: @practice, site: @site, date: @date, actor: @user).call
  end
end
