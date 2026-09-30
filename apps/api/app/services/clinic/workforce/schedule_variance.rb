module Clinic
  module Workforce
    # Compares recorded work only with explicit published shifts. Missing publication
    # is unknown, not evidence that an employee worked outside a selected schedule.
    class ScheduleVariance
      def initialize(employment:, period_start:, period_end:, site_ids:)
        @employment = employment
        @publications = SchedulePublication.where(practice_id: employment.practice_id, site_id: site_ids)
          .where(week_start_on: (period_start - 8.days)..(period_end + 1.day))
          .latest_first.to_a.group_by { |row| [ row.site_id, row.week_start_on ] }.values.map(&:first)
        @checks = {}
      end

      def source_versions
        @publications.sort_by(&:id).map { |row| [ row.id, row.site_id, row.week_start_on.iso8601, row.snapshot_digest ] }
      end

      def checks
        @checks.values
      end

      def off_schedule?(interval)
        site = interval.fetch(:site)
        start_at = interval.fetch(:started_at_utc)
        end_at = interval.fetch(:ended_at_utc)
        local_date = start_at.in_time_zone(site.timezone_override.presence || @employment.practice.timezone).to_date
        publications = @publications.select do |row|
          schedule_date = start_at.in_time_zone(row.timezone).to_date
          row.site_id == site.id && schedule_date >= row.week_start_on && schedule_date < row.week_start_on + 7.days
        end
        key = [ site.id, local_date ]
        candidates = @publications.select { |row| row.site_id == site.id }
        @checks[key] = { "site_id" => site.id, "local_date" => local_date.iso8601,
          "status" => publications.empty? ? "no_published_schedule" : "compared",
          "publication_ids" => publications.empty? ? [] : candidates.map(&:id).sort }
        return false if publications.empty?

        windows = candidates.flat_map(&:shift_snapshot).filter_map do |shift|
          next unless shift.fetch("employment_id").to_i == @employment.id
          [ Time.iso8601(shift.fetch("starts_at")), Time.iso8601(shift.fetch("ends_at")) ]
        end.sort_by(&:first)
        covered_until = start_at
        windows.each do |from, to|
          next if to <= covered_until
          break if from > covered_until
          covered_until = to
          return false if covered_until >= end_at
        end
        true
      end
    end
  end
end
