module Clinic
  module Workforce
    class UpsertScheduleShift
      def self.call(draft:, actor:, attributes:)
        input = attributes.to_h.with_indifferent_access
        practice = draft.practice
        Access.new(actor:, practice:).authorize!("workforce.schedule.manage", site: draft.site)
        local_start = ResolveLocalInterval.parse_local(input[:local_start])
        local_end = ResolveLocalInterval.parse_local(input[:local_end])
        unless local_start.to_date.between?(draft.week_start_on, draft.week_start_on + 6.days)
          raise ResolveLocalInterval::InvalidLocalTime, "Shift start must fall within the selected week."
        end
        unless (local_end - Rational(1, 1_000_000)).to_date.between?(draft.week_start_on, draft.week_start_on + 6.days)
          raise ResolveLocalInterval::InvalidLocalTime, "Shift end must fall within the selected week."
        end
        interval = ResolveLocalInterval.call(timezone: draft.timezone, local_start: input[:local_start], local_end: input[:local_end],
          start_occurrence: input[:start_occurrence].presence || "only", end_occurrence: input[:end_occurrence].presence || "only",
          infer_overnight: false)
        expected_revision = Integer(input.fetch(:expected_revision).to_s, 10)
        raise ArgumentError, "Expected revision must be positive." unless expected_revision.positive?
        break_minutes = Integer((input[:break_minutes].presence || "0").to_s, 10)
        raise ArgumentError, "Break minutes must be between 0 and 1440." unless break_minutes.between?(0, 1_440)
        role_name = input[:role_name].to_s.strip.presence
        raise ArgumentError, "Role name must be 120 characters or fewer." if role_name && role_name.length > 120
        shift = nil
        draft.with_lock do
          raise ArgumentError, "Published schedules cannot be edited." unless draft.editable?
          raise ActiveRecord::StaleObjectError.new(draft, "update") unless draft.revision == expected_revision
          employment = Employment.find_by!(practice_id: practice.id, id: input.fetch(:employment_id))
          shift = input[:id].present? ? draft.shifts.find_by!(public_id: input[:id]) : draft.shifts.build(practice:)
          shift.update!(employment:, timezone: draft.timezone, **interval,
            start_occurrence: input[:start_occurrence].presence || "only", end_occurrence: input[:end_occurrence].presence || "only",
            role_name:, break_minutes:)
          draft.update!(revision: draft.revision + 1)
        end
        [ draft.reload, shift ]
      end
    end
  end
end
