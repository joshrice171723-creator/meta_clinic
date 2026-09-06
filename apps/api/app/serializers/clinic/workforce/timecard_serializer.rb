module Clinic
  module Workforce
    module TimecardSerializer
      module_function

      def call(timecard, site_id: nil)
        snapshot = timecard.snapshot.deep_dup
        if site_id
          segments = Array(snapshot["segments"]).select { |segment| segment["site_id"] == site_id }
          snapshot["segments"] = segments
          snapshot["totals"] = restricted_totals(segments)
        end
        {
          id: timecard.id,
          employment_id: timecard.employment_id,
          employee_name: timecard.employment.staff_member.display_name,
          period_start: timecard.period_start.iso8601,
          period_end: timecard.period_end.iso8601,
          version_number: timecard.version_number,
          status: timecard.status,
          source_digest: timecard.source_digest,
          unresolved_exceptions: site_id ? site_exceptions(snapshot) : timecard.unresolved_exceptions,
          settings_provenance: site_id ? timecard.settings_provenance.slice(site_id.to_s) : timecard.settings_provenance,
          snapshot: snapshot,
          lock_version: timecard.lock_version,
          submitted_at: timecard.submitted_at&.utc&.iso8601(6),
          approved_at: timecard.approved_at&.utc&.iso8601(6)
        }
      end

      def adjustment(adjustment)
        {
          id: adjustment.id,
          employment_id: adjustment.employment_id,
          timecard_version_id: adjustment.timecard_version_id,
          status: adjustment.status,
          correction_type: adjustment.correction_type,
          proposed_changes: adjustment.proposed_changes,
          reason: adjustment.reason,
          requested_at: adjustment.requested_at.utc.iso8601(6),
          reviewed_at: adjustment.reviewed_at&.utc&.iso8601(6),
          decision_reason: adjustment.decision_reason,
          resulting_timecard_version_id: adjustment.resulting_timecard_version_id,
          lock_version: adjustment.lock_version
        }
      end

      def restricted_totals(segments)
        configured = segments.all? { |segment| !segment["overtime_minutes"].nil? }
        {
          "raw_minutes" => segments.sum { |segment| segment["raw_minutes"].to_i },
          "rounded_minutes" => segments.sum { |segment| segment["rounded_minutes"].to_i },
          "paid_minutes" => segments.sum { |segment| segment["paid_minutes"].to_i },
          "regular_minutes" => configured ? segments.sum { |segment| segment["regular_minutes"].to_i } : nil,
          "overtime_minutes" => configured ? segments.sum { |segment| segment["overtime_minutes"].to_i } : nil
        }
      end
      private_class_method :restricted_totals

      def site_exceptions(snapshot)
        Array(snapshot["segments"]).flat_map { |segment| Array(segment["exception_codes"]) }.uniq
      end
      private_class_method :site_exceptions
    end
  end
end
