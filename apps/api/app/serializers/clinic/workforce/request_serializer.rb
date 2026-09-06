module Clinic
  module Workforce
    module RequestSerializer
      SCHEMA_VERSION = "workforce-requests.v1"

      def self.call(record)
        base = { id: record.public_id, type: type(record), site_id: record.site_id.to_s, status: record.status,
          reason: record.reason, revision: record.revision, created_at: record.created_at.iso8601(6),
          decided_at: record.try(:decided_at)&.iso8601(6), decision_reason: record.try(:decision_reason) }
        case record
        when AvailabilityVersion
          base.merge(employment_id: record.employment_id.to_s, timezone: record.timezone,
            effective_from: record.effective_from&.iso8601, effective_until: record.effective_until&.iso8601,
            weekly_rules: record.weekly_rules)
        when TimeOffRequest
          base.merge(employment_id: record.employment_id.to_s, timezone: record.timezone,
            starts_at: record.starts_at.iso8601(6), ends_at: record.ends_at.iso8601(6))
        when ShiftSwapRequest
          base.merge(requester_employment_id: record.requester_employment_id.to_s,
            target_employment_id: record.target_employment_id.to_s, target_employee_name: record.target_employment.staff_member.display_name,
            offered_shift_public_id: record.offered_shift_public_id, schedule_publication_id: record.schedule_publication_id.to_s,
            target_reason: record.target_reason, expires_at: record.expires_at&.iso8601(6))
        end
      end

      def self.type(record)
        record.class.name.demodulize.underscore
      end

      def self.response(**payload)
        { schema_version: SCHEMA_VERSION }.merge(payload)
      end
    end
  end
end
