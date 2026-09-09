module Clinic
  module Workforce
    class ValidateSchedule
      Result = Data.define(:errors, :warnings) do
        def valid? = errors.empty?
      end

      def self.call(draft:)
        new(draft).call
      end

      def initialize(draft)
        @draft = draft
        @errors = []
        @warnings = []
      end

      def call
        shifts = draft.shifts.includes(employment: [ :staff_member, :employment_sites, { membership: :user } ])
          .order(:starts_at, :id).to_a
        validate_each(shifts)
        validate_internal_overlaps(shifts)
        validate_published_overlaps(shifts)
        Result.new(errors.freeze, warnings.freeze)
      end

      private

      attr_reader :draft, :errors, :warnings

      def validate_each(shifts)
        week_end = draft.week_start_on + 7.days
        shifts.each do |shift|
          label = shift.employment.staff_member.display_name
          errors << "#{label}: shift must begin within the selected week." unless shift.starts_at.in_time_zone(draft.timezone).to_date.between?(draft.week_start_on, week_end - 1.day)
          shift_end = shift.ends_at - Rational(1, 1_000_000)
          unless shift.employment.active_for_work?(at: shift.starts_at) && shift.employment.active_for_work?(at: shift_end)
            errors << "#{label}: employee is not active for the full shift."
          end
          unless shift.employment.eligible_site?(draft.site, at: shift.starts_at) && shift.employment.eligible_site?(draft.site, at: shift_end)
            errors << "#{label}: employee is not eligible for this site for the full shift."
          end
          errors << "#{label}: approved time off overlaps this shift." if approved_time_off?(shift)

          local_start_date = shift.starts_at.in_time_zone(draft.timezone).to_date
          local_end_date = shift_end.in_time_zone(draft.timezone).to_date
          availability = AvailabilityVersion.where(practice_id: draft.practice_id, site_id: draft.site_id,
            employment_id: shift.employment_id, status: %w[approved superseded])
            .where("effective_from <= ? AND (effective_until IS NULL OR effective_until >= ?)", local_start_date, local_end_date)
            .order(effective_from: :desc, revision: :desc, id: :desc).first
          errors << "#{label}: shift is outside recorded availability." if availability && !availability.available_for?(shift.starts_at, shift.ends_at)
          operating_hours_warning(shift, label)
        end
      end

      def validate_internal_overlaps(shifts)
        shifts.group_by(&:employment_id).each_value do |employee_shifts|
          employee_shifts.each_cons(2) do |left, right|
            errors << "#{left.employment.staff_member.display_name}: draft shifts overlap." if left.ends_at > right.starts_at
          end
        end
      end

      def validate_published_overlaps(shifts)
        latest = latest_publications.where.not(site_id: draft.site_id, week_start_on: draft.week_start_on)
        published = latest.flat_map(&:shift_snapshot)
        shifts.each do |shift|
          if published.any? { |row| row["employment_id"].to_i == shift.employment_id && Time.iso8601(row.fetch("starts_at")) < shift.ends_at && Time.iso8601(row.fetch("ends_at")) > shift.starts_at }
            errors << "#{shift.employment.staff_member.display_name}: a published shift at another site overlaps."
          end
        end
      end

      def latest_publications
        scope = SchedulePublication.where(practice_id: draft.practice_id)
        latest_ids = scope.group(:site_id, :week_start_on).maximum(:id).values
        scope.where(id: latest_ids)
      end

      def approved_time_off?(shift)
        TimeOffRequest.where(practice_id: draft.practice_id, employment_id: shift.employment_id, status: "approved")
          .overlapping(shift.starts_at, shift.ends_at).exists?
      end

      def operating_hours_warning(shift, label)
        local = shift.starts_at.in_time_zone(draft.timezone)
        hours = draft.site.operating_hours.find { |item| item.day_of_week == local.wday }
        return unless hours
        outside = hours.closed || hours.open_time.blank? || hours.close_time.blank? ||
          local.strftime("%H:%M") < hours.open_time.strftime("%H:%M") ||
          shift.ends_at.in_time_zone(draft.timezone).strftime("%H:%M") > hours.close_time.strftime("%H:%M")
        warnings << "#{label}: shift is outside facility operating hours. Facility hours are context only." if outside
      end
    end
  end
end
