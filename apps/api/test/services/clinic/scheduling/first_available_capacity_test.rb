require "test_helper"

class FirstAvailableCapacityTest < ActiveSupport::TestCase
  setup do
    travel_to Time.utc(2026, 10, 3, 8)
    @practice = Clinic::Practice.create!(name: "Synthetic First Available Clinic", timezone: "UTC")
    @actor = User.create!(email_address: "first-available-capacity@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "appointments.book", "facilities.write")
    @site = @practice.sites.create!(code: "FIRST", status: "active")
    @visit_type = @practice.visit_types.create!(code: "Synthetic First Available Visit")
    Development::GuidedClinicDemo.configure_site_profile!(practice: @practice, site: @site, membership: @membership,
      clinic_type: "primary_care", request_key: "first-available-profile", finalize: true)
    @patient = @practice.patients.create!(display_name: "Synthetic First Patient", reference: "FIRST-001")
    @other_patient = @practice.patients.create!(display_name: "Synthetic Second Patient", reference: "FIRST-002")
    @room = @site.rooms.create!(practice: @practice, code: "FIRST-ROOM", kind: "physical")
    @start = Time.utc(2026, 10, 5, 10)
    @site.operating_hours.create!(practice: @practice, day_of_week: @start.wday,
      open_time: "08:00", close_time: "17:00", closed: false)
  end

  teardown { travel_back }

  test "first available books within site hours without a provider template" do
    appointment = book(@patient)

    assert_nil appointment.booked_clinician_id
    assert_equal 1, appointment.clinician_allocation
    assert_equal "scheduled", appointment.status
  end

  test "first available rejects a closed interval and a duplicate patient interval" do
    assert_raises(ArgumentError) { book(@patient, starts_at: @start.change(hour: 18)) }
    assert_empty @practice.appointments
    book(@patient)

    error = assert_raises(ArgumentError) { book(@patient, starts_at: @start + 15.minutes) }

    assert_match "patient already has an appointment", error.message
    assert_equal 1, @practice.appointments.count
  end

  test "first available rejects an occupied physical room and a nonphysical room" do
    book(@patient, room: @room)

    error = assert_raises(ArgumentError) { book(@other_patient, room: @room) }
    assert_match "room is already booked", error.message
    virtual = @site.rooms.create!(practice: @practice, code: "FIRST-VIDEO", kind: "telehealth")
    assert_raises(ArgumentError) { book(@other_patient, room: virtual) }
    assert_equal 1, @practice.appointments.count
  end

  test "provider independent capacity checks honor active room holds" do
    clinician = @practice.clinician_profiles.create!(membership: @membership, display_name: "Synthetic Hold Clinician")
    Clinic::Scheduling::ScheduleHold.create!(practice: @practice, site: @site, clinician: clinician, room: @room,
      starts_at: @start, ends_at: @start + 30.minutes, expires_at: @start - 1.hour, request_key: "first-room-hold")

    ApplicationRecord.transaction do
      error = assert_raises(ArgumentError) do
        Clinic::Scheduling::CapacityGuard.check!(practice: @practice, site: @site, clinician: nil, patient: @patient,
          room: @room, starts_at: @start, ends_at: @start + 30.minutes)
      end
      assert_match "room is held pending booking", error.message
    end
  end

  private

  def book(patient, starts_at: @start, room: nil)
    Clinic::Scheduling::BookAppointment.call(practice: @practice, actor: @actor, patient: patient,
      site: @site, room: room, visit_type: @visit_type, first_available: true,
      starts_at: starts_at, ends_at: starts_at + 30.minutes, request_key: SecureRandom.uuid)
  end
end
