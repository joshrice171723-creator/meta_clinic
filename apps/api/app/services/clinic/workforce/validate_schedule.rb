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
          local_start = shift.starts_at.in_time_zone(draft.timezone)
          shift_end = shift.ends_at - Rational(1, 1_000_000)
          local_end = shift_end.in_time_zone(draft.timezone)
          unless local_start.to_date.between?(draft.week_start_on, week_end - 1.day)
            errors << "#{label}: shift must begin within the selected week."
          end
          unless local_end.to_date.between?(draft.week_start_on, week_end - 1.day)
            errors << "#{label}: shift must end within the selected week."
          end
          errors << "#{label}: shift end must be after its start." unless shift.ends_at > shift.starts_at
          unless shift.employment.active_for_work?(at: shift.starts_at) && shift.employment.active_for_work?(at: shift_end)
            errors << "#{label}: employee is not active for the full shift."
          end
          unless shift.employment.eligible_site?(draft.site, at: shift.starts_at) && shift.employment.eligible_site?(draft.site, at: shift_end)
            errors << "#{label}: employee is not eligible for this site for the full shift."
          end
          errors << "#{label}: approved time off overlaps this shift." if approved_time_off?(shift)

          validate_availability(shift, label)
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

      def validate_availability(shift, label)
        # ponytail: scan one employee's history; add per-zone database filtering if histories grow.
        versions = AvailabilityVersion.where(practice_id: draft.practice_id, site_id: draft.site_id,
          employment_id: shift.employment_id, status: %w[approved superseded]).to_a
        return if versions.empty?

        availability_boundaries(versions, shift.starts_at, shift.ends_at).each_cons(2) do |segment_start, segment_end|
          version = availability_for(versions, segment_start)
          next unless version
          next if version.available_for?(segment_start, segment_end)

          errors << "#{label}: shift is outside recorded availability."
          break
        end
      end

      def availability_boundaries(versions, starts_at, ends_at)
        boundaries = [ starts_at, ends_at ]
        versions.each do |version|
          zone = ActiveSupport::TimeZone[version.timezone]
          next unless zone

          first_date = starts_at.in_time_zone(zone).to_date
          last_date = (ends_at - Rational(1, 1_000_000)).in_time_zone(zone).to_date
          (first_date + 1).upto(last_date) { |date| add_availability_boundary(boundaries, zone, date, starts_at, ends_at) }
          [ version.effective_from, version.effective_until&.+(1.day) ].compact.each do |date|
            add_availability_boundary(boundaries, zone, date, starts_at, ends_at)
          end
        end
        boundaries.uniq.sort
      end

      def add_availability_boundary(boundaries, zone, date, starts_at, ends_at)
        boundary = zone.local(date.year, date.month, date.day).utc
        boundaries << boundary if boundary > starts_at && boundary < ends_at
      end

      def availability_for(versions, instant)
        versions.select do |version|
          date = instant.in_time_zone(version.timezone).to_date
          version.effective_from <= date && (version.effective_until.nil? || version.effective_until >= date)
        end.max_by do |version|
          [ version.effective_from, version.status == "approved" ? 1 : 0, version.decided_at || version.created_at, version.id ]
        end
      end

      def operating_hours_warning(shift, label)
        timezone = draft.site.timezone_override.presence || draft.practice.timezone
        local_start = shift.starts_at.in_time_zone(timezone)
        local_end = shift.ends_at.in_time_zone(timezone)
        operating_hours = draft.site.operating_hours
        exception = draft.site.hour_exceptions.find_by(date: local_start.to_date)
        return if operating_hours.empty? && exception.nil?

        hours = exception || operating_hours.find { |item| item.day_of_week == local_start.wday }
        outside = hours.nil? || hours.closed || hours.open_time.blank? || hours.close_time.blank? ||
          local_start.to_date != local_end.to_date ||
          local_start.strftime("%H:%M") < hours.open_time.strftime("%H:%M") ||
          local_end.strftime("%H:%M") > hours.close_time.strftime("%H:%M")
        if outside
          interval = "#{local_start.strftime('%b %-d, %H:%M %Z')} – #{local_end.strftime('%b %-d, %H:%M %Z')}"
          warnings << "#{label} (#{interval}): shift is outside facility operating hours. Facility hours are context only."
        end
      end
    end
  end
end
