module Clinic
  module Workforce
    class CalculateTimecard
      class InvalidPunchSequence < StandardError; end

      def self.call(employment:, period_start:, actor_membership:, expected_source_digest: nil, pending_adjustment: nil)
        new(employment: employment, period_start: period_start, actor_membership: actor_membership,
          expected_source_digest: expected_source_digest, pending_adjustment: pending_adjustment).call
      end

      def self.current_source_digest(employment:, period_start:)
        new(employment: employment, period_start: period_start, actor_membership: nil).source_digest
      end

      def self.current_period_start(practice:, at: Current.business_time)
        values = EffectiveSettings.call(practice: practice, at: at).fetch(:values)
        zone = ActiveSupport::TimeZone[values.fetch("timezone")]
        raise ArgumentError, "Workforce timezone is invalid" unless zone
        local_time = at.in_time_zone(zone)
        local_date = local_time.to_date
        start_day = Integer(values.fetch("workweek_start_day"))
        period_start = local_date - ((local_date.wday - start_day) % 7).days
        boundary = zone.parse("#{period_start.iso8601} #{values.fetch('workweek_start_time')}")
        raise ArgumentError, "Workweek boundary is invalid" unless boundary

        period_start -= 7.days if local_time < boundary
        period_start
      end

      def initialize(employment:, period_start:, actor_membership:, expected_source_digest: nil, pending_adjustment: nil)
        @employment = employment
        @period_start = Date.iso8601(period_start.to_s)
        @period_end = @period_start + 7.days
        @actor_membership = actor_membership
        @expected_source_digest = expected_source_digest
        @pending_adjustment = pending_adjustment
      rescue Date::Error
        raise ArgumentError, "Period start must be an ISO date"
      end

      def call
        employment.with_lock do
          validate_period_boundary!
          digest = source_digest
          if expected_source_digest.present? && expected_source_digest != digest
            raise ActiveRecord::StaleObjectError.new(employment, "calculate")
          end
          prior = versions.order(version_number: :desc).first
          return prior if prior&.source_digest == digest

          rows, exceptions, provenance = calculate_rows
          totals = build_totals(rows)
          version = TimecardVersion.create!(
            practice: employment.practice,
            employment: employment,
            period_start: period_start,
            period_end: period_end,
            version_number: prior&.version_number.to_i + 1,
            previous_version: prior,
            source_digest: digest,
            settings_provenance: provenance,
            unresolved_exceptions: exceptions.uniq,
            raw_total_minutes: totals.fetch(:raw_minutes),
            rounded_total_minutes: totals.fetch(:rounded_minutes),
            regular_minutes: totals[:regular_minutes],
            overtime_minutes: totals[:overtime_minutes],
            snapshot: {}
          )
          segments = rows.map { |row| version.time_segments.create!(row.merge(practice: employment.practice)) }
          version.update!(snapshot: snapshot_for(version, segments, totals))
          version
        end
      end

      def source_digest
        payload = {
          punches: punches.map { |p| [ p.id, p.site_id, p.event_type, p.occurred_at_utc.utc.iso8601(6) ] },
          adjustments: effective_adjustments.map { |adjustment| adjustment_source_tuple(adjustment) },
          settings: settings_sources,
          period: [ period_start.iso8601, period_end.iso8601 ]
        }
        Digest::SHA256.hexdigest(JSON.generate(payload))
      end

      private

      attr_reader :employment, :period_start, :period_end, :actor_membership, :pending_adjustment, :expected_source_digest

      def versions
        TimecardVersion.where(practice_id: employment.practice_id, employment_id: employment.id,
          period_start: period_start, period_end: period_end)
      end

      def punches
        @punches ||= Punch.where(practice_id: employment.practice_id, employment_id: employment.id)
          .where(occurred_at_utc: (period_bounds.first - 2.days)..(period_bounds.last + 2.days))
          .order(:occurred_at_utc, :id).to_a
      end

      def effective_adjustments
        @effective_adjustments ||= begin
          records = AdjustmentRequest.where(practice_id: employment.practice_id, employment_id: employment.id, status: "approved")
            .joins(:timecard_version).where(clinic_workforce_timecard_versions: { period_start: period_start, period_end: period_end })
            .order(:reviewed_at, :id).to_a
          records << pending_adjustment if pending_adjustment
          records
        end
      end

      def adjustment_source_tuple(adjustment)
        [
          adjustment.id,
          adjustment.correction_type,
          adjustment.proposed_changes.to_h.stringify_keys.sort.to_h,
          adjustment.request_key
        ]
      end

      def settings_sources
        SettingsVersion.where(practice_id: employment.practice_id)
          .where("effective_from < ?", period_end + 2.days)
          .order(:effective_from, :id)
          .pluck(:id, :site_id, :revision, :effective_from, :values)
          .map { |id, site_id, revision, effective_from, values| [ id, site_id, revision, effective_from.utc.iso8601(6), values ] }
      end

      def calculate_rows
        intervals, exceptions = punch_intervals
        apply_adjustments!(intervals, exceptions)
        intervals = intervals.flat_map { |interval| split_interval(interval) }
        rows = []
        provenance = {}
        overtime_state = { daily: Hash.new(0), weekly: 0 }

        intervals.sort_by { |row| [ row.fetch(:started_at_utc), row.fetch(:site).id ] }.each do |interval|
          settings = EffectiveSettings.call(practice: employment.practice, site: interval.fetch(:site), at: interval.fetch(:started_at_utc))
          values = settings.fetch(:values)
          raw_seconds = (interval.fetch(:ended_at_utc) - interval.fetch(:started_at_utc)).to_i
          raw_minutes = (raw_seconds / 60.0).round
          rounded = round_minutes(raw_seconds, values)
          paid = interval.fetch(:segment_kind) == "break" && !values.fetch("break_paid", false) ? 0 : rounded
          segment_exceptions = Array(interval[:exception_codes])
          daily_key = interval.fetch(:started_at_utc).in_time_zone(workweek_zone).to_date
          regular, overtime, overtime_exception = categorize_overtime(paid, values, daily_key, overtime_state)
          segment_exceptions << overtime_exception if overtime_exception
          provenance[interval.fetch(:site).id.to_s] = settings.fetch(:versions)
          exceptions.concat(segment_exceptions)
          rows << {
            site: interval.fetch(:site),
            segment_kind: interval.fetch(:segment_kind),
            local_date: interval.fetch(:local_date),
            started_at_utc: interval.fetch(:started_at_utc),
            ended_at_utc: interval.fetch(:ended_at_utc),
            raw_minutes: raw_minutes,
            rounded_minutes: rounded,
            paid_minutes: paid,
            regular_minutes: regular,
            overtime_minutes: overtime,
            source_punch_ids: interval.fetch(:source_punch_ids),
            settings_provenance: settings.fetch(:versions),
            exception_codes: segment_exceptions.uniq
          }
        rescue EffectiveSettings::Unconfigured
          exceptions << "workforce_settings_unconfigured"
        end
        [ rows, exceptions, provenance ]
      end

      def punch_intervals
        intervals = []
        exceptions = []
        state = nil
        opened = nil
        punches.each do |punch|
          next if punch.occurred_at_utc >= period_bounds.last && state.nil?

          resolved_at = resolved_open_punches[opened&.id]
          if resolved_at && resolved_at <= punch.occurred_at_utc
            state = nil
            opened = nil
          end

          case punch.event_type
          when "clock_in"
            if state
              exceptions << "duplicate_clock_in"
            else
              state = :work
              opened = punch
            end
          when "break_start"
            if state == :work
              intervals << interval(opened, punch, "work")
              state = :break
              opened = punch
            else
              exceptions << "break_start_without_work"
            end
          when "break_end"
            if state == :break
              intervals << interval(opened, punch, "break")
              state = :work
              opened = punch
            else
              exceptions << "break_end_without_break"
            end
          when "clock_out"
            if state == :work
              intervals << interval(opened, punch, "work")
              state = nil
              opened = nil
            elsif state == :break
              exceptions << "clock_out_during_break"
            else
              exceptions << "clock_out_without_clock_in"
            end
          end
        end
        if opened && resolved_open_punches.key?(opened.id)
          state = nil
          opened = nil
        end
        exceptions << (state == :break ? "missing_break_end" : "missing_clock_out") if state
        [ intervals, exceptions ]
      end

      def resolved_open_punches
        @resolved_open_punches ||= effective_adjustments.each_with_object({}) do |adjustment, resolved|
          changes = adjustment.proposed_changes.to_h.stringify_keys
          next if changes["resolves_open_punch_id"].blank? || changes["ended_at_utc"].blank?

          resolved[changes["resolves_open_punch_id"].to_i] = Time.iso8601(changes["ended_at_utc"].to_s).utc
        end
      end

      def interval(opened, closed, kind)
        raise InvalidPunchSequence, "Punch timestamps are out of order" unless closed.occurred_at_utc > opened.occurred_at_utc
        {
          site: opened.site,
          segment_kind: kind,
          local_date: opened.local_date,
          started_at_utc: opened.occurred_at_utc,
          ended_at_utc: closed.occurred_at_utc,
          source_punch_ids: [ opened.id, closed.id ],
          exception_codes: opened.site_id == closed.site_id ? [] : [ "cross_site_interval" ]
        }
      end

      def split_interval(interval)
        start_at = [ interval.fetch(:started_at_utc), period_bounds.first ].max
        end_at = [ interval.fetch(:ended_at_utc), period_bounds.last ].min
        return [] unless end_at > start_at

        site = interval.fetch(:site)
        site_zone = ActiveSupport::TimeZone[site.timezone_override.presence || employment.practice.timezone] || workweek_zone
        fixed_boundaries = [ nil, site.id ].flat_map { |site_id| setting_boundaries_by_site.fetch(site_id, []) }
          .select { |boundary| boundary > start_at && boundary < end_at }
        slices = []
        cursor = start_at
        while cursor < end_at
          candidates = [ end_at, next_midnight(site_zone, cursor), next_midnight(workweek_zone, cursor) ] +
            fixed_boundaries.select { |boundary| boundary > cursor }
          boundary = candidates.select { |candidate| candidate > cursor }.min || end_at
          slices << interval.merge(
            started_at_utc: cursor,
            ended_at_utc: boundary,
            local_date: cursor.in_time_zone(site_zone).to_date
          )
          cursor = boundary
        end
        slices
      end

      def next_midnight(zone, instant)
        date = instant.in_time_zone(zone).to_date + 1.day
        zone.local(date.year, date.month, date.day).utc
      end

      def setting_boundaries_by_site
        @setting_boundaries_by_site ||= SettingsVersion.where(practice_id: employment.practice_id)
          .where(effective_from: period_bounds.first...period_bounds.last).pluck(:site_id, :effective_from)
          .each_with_object(Hash.new { |hash, key| hash[key] = [] }) do |(site_id, effective_from), boundaries|
            boundaries[site_id] << effective_from.utc
          end
      end

      def apply_adjustments!(intervals, exceptions)
        effective_adjustments.each do |adjustment|
          changes = adjustment.proposed_changes.stringify_keys
          source_segment = changes["source_segment_id"].present? ? adjustment.timecard_version.time_segments.find_by(id: changes["source_segment_id"]) : nil
          if %w[replace_segment remove_segment].include?(adjustment.correction_type)
            source_ids = source_segment&.source_punch_ids
            matched = false
            intervals.replace(intervals.flat_map do |row|
              overlaps = source_segment && source_segment.started_at_utc < row.fetch(:ended_at_utc) &&
                source_segment.ended_at_utc > row.fetch(:started_at_utc)
              next [ row ] unless source_ids.present? && row.fetch(:source_punch_ids) == source_ids && overlaps

              matched = true
              subtract_interval(row, source_segment.started_at_utc, source_segment.ended_at_utc)
            end)
            exceptions << "adjustment_source_not_found" unless matched
            next unless matched
          end
          next if adjustment.correction_type == "remove_segment"

          site = employment.practice.sites.find(changes.fetch("site_id"))
          started = Time.iso8601(changes.fetch("started_at_utc")).utc
          ended = Time.iso8601(changes.fetch("ended_at_utc")).utc
          raise ArgumentError, "Adjusted end must be after start" unless ended > started
          zone = ActiveSupport::TimeZone[site.timezone_override.presence || employment.practice.timezone] || ActiveSupport::TimeZone["UTC"]
          if changes["resolves_open_punch_id"].present?
            resolved_punch_id = changes["resolves_open_punch_id"].to_i
            intervals.reject! { |row| row.fetch(:source_punch_ids).include?(resolved_punch_id) }
          end
          intervals << {
            site: site, segment_kind: "manual", local_date: started.in_time_zone(zone).to_date,
            started_at_utc: started, ended_at_utc: ended,
            source_punch_ids: changes["resolves_open_punch_id"].present? ? [ changes["resolves_open_punch_id"].to_i ] : [],
            exception_codes: []
          }
          if changes["resolves_open_punch_id"].present?
            exceptions.delete("missing_clock_out")
            exceptions.delete("missing_break_end")
          end
        end
      end

      def subtract_interval(interval, excluded_start, excluded_end)
        row_start = interval.fetch(:started_at_utc)
        row_end = interval.fetch(:ended_at_utc)
        return [ interval ] unless excluded_start && excluded_end && excluded_end > row_start && excluded_start < row_end

        pieces = []
        left_end = [ excluded_start, row_end ].min
        pieces << interval.merge(ended_at_utc: left_end) if left_end > row_start
        right_start = [ excluded_end, row_start ].max
        pieces << interval.merge(started_at_utc: right_start) if row_end > right_start
        pieces
      end

      def round_minutes(raw_seconds, values)
        return (raw_seconds / 60.0).round if values["rounding_mode"] == "none"

        exact = raw_seconds / 60.0
        increment = integer_setting(values["rounding_increment_minutes"]) || 1
        scaled = exact / increment
        units = case values["rounding_mode"]
        when "up" then scaled.ceil
        when "down" then scaled.floor
        when "nearest" then scaled.round
        else exact.round.fdiv(increment).round
        end
        units * increment
      end

      def integer_setting(value)
        number = Integer(value, exception: false)
        number if number&.positive?
      end

      def categorize_overtime(paid, values, daily_key, state)
        return [ 0, 0, nil ] if paid.zero?

        daily_threshold = integer_setting(values["daily_overtime_threshold_minutes"])
        weekly_threshold = integer_setting(values["weekly_overtime_threshold_minutes"])
        return [ nil, nil, "overtime_threshold_unconfigured" ] if daily_threshold.nil? && weekly_threshold.nil?

        if daily_threshold && weekly_threshold
          case values["overtime_precedence"]
          when "daily_then_weekly"
            daily_regular = [ paid, [ daily_threshold - state[:daily][daily_key], 0 ].max ].min
            state[:daily][daily_key] += paid
            regular = [ daily_regular, [ weekly_threshold - state[:weekly], 0 ].max ].min
            state[:weekly] += daily_regular
          when "weekly_then_daily"
            weekly_regular = [ paid, [ weekly_threshold - state[:weekly], 0 ].max ].min
            state[:weekly] += paid
            regular = [ weekly_regular, [ daily_threshold - state[:daily][daily_key], 0 ].max ].min
            state[:daily][daily_key] += weekly_regular
          else
            return [ nil, nil, "overtime_precedence_unconfigured" ]
          end
        elsif daily_threshold
          regular = [ paid, [ daily_threshold - state[:daily][daily_key], 0 ].max ].min
          state[:daily][daily_key] += paid
        else
          regular = [ paid, [ weekly_threshold - state[:weekly], 0 ].max ].min
          state[:weekly] += paid
        end
        [ regular, paid - regular, nil ]
      end

      def workweek_zone
        @workweek_zone ||= begin
          values = EffectiveSettings.call(practice: employment.practice, at: period_bounds.first).fetch(:values)
          ActiveSupport::TimeZone[values.fetch("timezone")] || raise(ArgumentError, "Workforce timezone is invalid")
        end
      end

      def validate_period_boundary!
        values = EffectiveSettings.call(practice: employment.practice, at: period_bounds.first).fetch(:values)
        expected_day = Integer(values.fetch("workweek_start_day"))
        raise ArgumentError, "Period start must match the configured workweek" unless period_start.wday == expected_day
      end

      def period_bounds
        @period_bounds ||= begin
          values = EffectiveSettings.call(practice: employment.practice, at: period_start.beginning_of_day).fetch(:values)
          zone = ActiveSupport::TimeZone[values.fetch("timezone")]
          raise ArgumentError, "Workforce timezone is invalid" unless zone
          clock = values.fetch("workweek_start_time")
          start_at = zone.parse("#{period_start.iso8601} #{clock}")
          end_at = zone.parse("#{period_end.iso8601} #{clock}")
          raise ArgumentError, "Workweek boundary is invalid" unless start_at && end_at && end_at > start_at
          [ start_at.utc, end_at.utc ]
        end
      end

      def build_totals(rows)
        overtime_configured = rows.all? { |row| !row[:overtime_minutes].nil? }
        {
          raw_minutes: rows.sum { |row| row.fetch(:raw_minutes) },
          rounded_minutes: rows.sum { |row| row.fetch(:rounded_minutes) },
          paid_minutes: rows.sum { |row| row.fetch(:paid_minutes) },
          regular_minutes: overtime_configured ? rows.sum { |row| row.fetch(:regular_minutes) } : nil,
          overtime_minutes: overtime_configured ? rows.sum { |row| row.fetch(:overtime_minutes) } : nil
        }
      end

      def snapshot_for(version, segments, totals)
        {
          "period" => { "start" => period_start.iso8601, "end" => period_end.iso8601 },
          "totals" => totals.transform_keys(&:to_s),
          "source_punch_ids" => punches.map(&:id),
          "segments" => segments.map do |segment|
            {
              "id" => segment.id, "site_id" => segment.site_id, "segment_kind" => segment.segment_kind,
              "local_date" => segment.local_date.iso8601,
              "started_at_utc" => segment.started_at_utc.utc.iso8601(6), "ended_at_utc" => segment.ended_at_utc.utc.iso8601(6),
              "raw_minutes" => segment.raw_minutes, "rounded_minutes" => segment.rounded_minutes,
              "paid_minutes" => segment.paid_minutes, "regular_minutes" => segment.regular_minutes,
              "overtime_minutes" => segment.overtime_minutes, "exception_codes" => segment.exception_codes,
              "settings_provenance" => segment.settings_provenance
            }
          end
        }
      end
    end
  end
end
