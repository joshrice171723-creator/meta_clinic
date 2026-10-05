require "test_helper"

class WorkforceScheduleSerializerTest < ActiveSupport::TestCase
  Publication = Struct.new(:id, :site_id, :site, :week_start_on, :timezone, :version, :published_at, :supersedes_id, :shift_snapshot)
  Site = Struct.new(:name)

  test "marks only supplied employee schedule conflicts" do
    publication = Publication.new(1, 2, Site.new("Main"), Date.new(2026, 9, 7), "America/Chicago", 1, Time.utc(2026, 9, 1), nil,
      [{ "id" => "overlap", "employment_id" => 3 }, { "id" => "clear", "employment_id" => 3 },
        { "id" => "other-employee", "employment_id" => 4 }])

    shifts = Clinic::Workforce::ScheduleSerializer.publication(publication, employee_id: 3,
      time_off_conflict_shift_ids: ["overlap", "other-employee"]).fetch(:shifts)

    assert_equal %w[overlap clear], shifts.map { |shift| shift.fetch("id") }
    assert_equal true, shifts.first.fetch("time_off_conflict")
    assert_equal false, shifts.second.fetch("time_off_conflict")
    assert_not publication.shift_snapshot.first.key?("time_off_conflict")
  end
end
