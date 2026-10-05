module Development
  class DemoSandboxWeeklySchedule
    SHIFT_FIELDS = %w[employment_id starts_at ends_at local_start local_end timezone
      start_occurrence end_occurrence role_name break_minutes].freeze

    def self.prepare!(run)
      raise ActiveRecord::RecordNotFound unless GuidedDemoAccess.enabled? &&
        run.lesson_key == DemoLessonCatalog::SANDBOX_KEY && run.visitor_id.present?

      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended('apply:demo-sandbox-pool', 0))"
        )
        run.lock!
        raise ActiveRecord::RecordNotFound unless run.active?

        run.practice.organization.practices.order(:id).each do |practice|
          sites = practice.sites.where(status: "active").order(:id).to_a
          employments = Clinic::Workforce::Employment.where(practice:)
            .includes(:staff_member, :employment_sites, membership: :user).order(:id).to_a
          sites.each do |site|
            zone = ActiveSupport::TimeZone[site.timezone_override.presence || practice.timezone]
            raise ArgumentError, "Sandbox workforce timezone is unavailable" unless zone
            week = Current.business_time.in_time_zone(zone).to_date.beginning_of_week(:monday)
            key = "sandbox-weekly-plan-#{site.id}-#{week.iso8601}"
            publications = Clinic::Workforce::SchedulePublication.where(practice:)
            next if publications.exists?(idempotency_key: key)

            drafts = Clinic::Workforce::ScheduleDraft.where(practice:, site:, week_start_on: week)
            raise ArgumentError, "Finish the existing schedule draft before preparing demo shifts." if drafts.where(status: "draft").exists?

            latest = publications.where(id: publications.group(:site_id, :week_start_on).maximum(:id).values).to_a
            prior = latest.find { |item| item.site_id == site.id && item.week_start_on == week }
            saved = latest.flat_map(&:shift_snapshot)
            draft = Clinic::Workforce::CreateScheduleDraft.call(practice:, actor: run.operator_user,
              site:, week_start_on: week, timezone: zone.tzinfo.name)
            prior&.schedule_draft&.shifts&.each do |shift|
              draft.shifts.create!(practice:, **shift.attributes.slice(*SHIFT_FIELDS).symbolize_keys)
            end

            employments.each do |employment|
              # One home location per employee avoids simultaneous cross-site shifts.
              next unless sites.find { |candidate| employment.eligible_site?(candidate) } == site
              5.times do |day|
                date = week + day.days
                interval = Clinic::Workforce::ResolveLocalInterval.call(timezone: zone.tzinfo.name,
                  local_start: "#{date.iso8601}T09:00", local_end: "#{date.iso8601}T17:00")
                starts_at, ends_at = interval.values_at(:starts_at, :ends_at)
                next unless employment.eligible_site?(site, at: starts_at) &&
                  employment.eligible_site?(site, at: ends_at - 1.second)
                next if saved.any? { |shift| shift["employment_id"].to_i == employment.id &&
                  Time.iso8601(shift.fetch("starts_at")) < zone.local(date.year, date.month, date.day) + 1.day &&
                  Time.iso8601(shift.fetch("ends_at")) > zone.local(date.year, date.month, date.day) }
                next if Clinic::Workforce::TimeOffRequest.where(practice:, employment:, status: "approved")
                  .overlapping(starts_at, ends_at).exists?

                draft.shifts.create!(practice:, employment:, **interval, timezone: zone.tzinfo.name,
                  start_occurrence: "only", end_occurrence: "only",
                  role_name: employment.staff_member.job_title, break_minutes: 30)
              end
            end
            Clinic::Workforce::PublishSchedule.call(draft:, actor: run.operator_user,
              expected_revision: draft.revision, idempotency_key: key)
          end
        end
      end
    end
  end
end
