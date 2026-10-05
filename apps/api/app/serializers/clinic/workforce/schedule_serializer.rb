module Clinic
  module Workforce
    module ScheduleSerializer
      SCHEMA_VERSION = "workforce-schedule.v1"

      def self.template(record)
        { id: record.id.to_s, site_id: record.site_id.to_s, name: record.name, timezone: record.timezone,
          shift_definitions: record.shift_definitions, revision: record.revision, active: record.active }
      end

      def self.shift(record)
        { id: record.public_id, employment_id: record.employment_id.to_s,
          employee_name: record.employment.staff_member.display_name, starts_at: record.starts_at.iso8601(6),
          ends_at: record.ends_at.iso8601(6), local_start: record.local_start, local_end: record.local_end,
          timezone: record.timezone, start_occurrence: record.start_occurrence, end_occurrence: record.end_occurrence,
          role_name: record.role_name, break_minutes: record.break_minutes, lock_version: record.lock_version }
      end

      def self.draft(record, include_shifts: true)
        value = { id: record.id.to_s, site_id: record.site_id.to_s, week_start_on: record.week_start_on.iso8601,
          timezone: record.timezone, status: record.status, revision: record.revision,
          schedule_template_id: record.schedule_template_id&.to_s }
        value[:shifts] = record.shifts.includes(employment: :staff_member).order(:starts_at, :id).map { |item| shift(item) } if include_shifts
        value
      end

      def self.publication(record, employee_id: nil, time_off_conflict_shift_ids: [])
        shifts = record.shift_snapshot
        shifts = shifts.select { |row| row["employment_id"].to_i == employee_id } if employee_id
        { id: record.id.to_s, site_id: record.site_id.to_s, site_name: record.site.name,
          week_start_on: record.week_start_on.iso8601, timezone: record.timezone, version: record.version,
          published_at: record.published_at.iso8601(6), supersedes_id: record.supersedes_id&.to_s,
          shifts: shifts.map { |row| row.merge("employment_id" => row["employment_id"].to_s,
            "time_off_conflict" => time_off_conflict_shift_ids.include?(row["id"])) } }
      end

      def self.response(**payload)
        { schema_version: SCHEMA_VERSION }.merge(payload)
      end
    end
  end
end
