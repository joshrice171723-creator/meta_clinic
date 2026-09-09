require "test_helper"

class DevelopmentBulkDevSeedTest < ActiveSupport::TestCase
  test "creates a deterministic 90-day synthetic clinic population" do
    anchor = Time.find_zone!(Development::BulkDevSeed::TIME_ZONE).local(2026, 9, 3, 7, 15)

    Development::BulkDevSeed.call(as_of: anchor)
    practice = Clinic::Practice.find_by!(name: Development::BulkDevSeed::PRACTICE_NAME)

    assert_equal 100, practice.patients.count
    assert_equal (1..100).map { |number| format("SYNTH_PAT_%03d", number) }, practice.patients.order(:reference).pluck(:reference)
    assert_equal %w[SYNTH_PROV_001 SYNTH_PROV_002], practice.clinician_profiles.order(:reference).pluck(:reference)
    assert_equal 13, practice.staff_members.count
    assert_equal 12, practice.staff_members.where(active: true).count
    assert Clinic::RefundEvent.where(practice: practice).all? { |refund| refund.reason.present? }

    starts_at = practice.appointments.pluck(:starts_at)
    assert_equal Date.new(2026, 7, 20), starts_at.min.to_date
    assert_equal Date.new(2026, 10, 17), starts_at.max.to_date
    current_encounters = practice.encounters.open.includes(:appointment).order("clinic_appointments.starts_at")
    assert_equal 6, current_encounters.count
    assert_equal Array.new(6, Date.new(2026, 9, 3)), current_encounters.map { |encounter| encounter.appointment.starts_at.to_date }
    assert_equal Array.new(6, "confirmed"), current_encounters.map { |encounter| encounter.appointment.status }

    before = practice.appointments.order(:id).pluck(:starts_at)
    Development::BulkDevSeed.call(as_of: anchor + 12.hours)
    assert_equal before, practice.appointments.order(:id).pluck(:starts_at)
  end
end
