# Read-back check for a freshly prepared, unedited local sandbox:
# bin/rails runner script/check_demo_weekly_schedule.rb RUN_ID
abort "Local development only" unless Rails.env.development?
run = Development::DemoRun.active.find(ARGV.fetch(0))
raise "Expected a visitor sandbox" unless run.lesson_key == Development::DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?
practices = run.practice.organization.practices
publications = Clinic::Workforce::SchedulePublication.where(practice: practices)
before = publications.order(:id).pluck(:id)
Development::DemoSandboxWeeklySchedule.prepare!(run)
raise "Weekly preparation was not idempotent" unless publications.order(:id).pluck(:id) == before

checked = 0
practices.each do |practice|
  sites = practice.sites.where(status: "active").order(:id).to_a
  latest = publications.where(practice: practice)
  snapshots = latest.where(id: latest.group(:site_id, :week_start_on).maximum(:id).values).flat_map(&:shift_snapshot)
  Clinic::Workforce::Employment.where(practice: practice).find_each do |employment|
    site = sites.find { |candidate| employment.eligible_site?(candidate) }
    next unless site
    zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone]
    week = Current.business_time.in_time_zone(zone).to_date.beginning_of_week(:monday)
    dates = snapshots.select { |shift| shift.fetch("employment_id").to_i == employment.id }
      .map { |shift| Time.iso8601(shift.fetch("starts_at")).in_time_zone(zone).to_date }
    raise "Missing weekday shifts for employment #{employment.id}" unless (0...5).all? { |day| dates.include?(week + day) }
    checked += 1
  end
end
raise "No employees checked" if checked.zero?
puts "Verified #{checked} employee workweeks; repeated preparation created no publications."
