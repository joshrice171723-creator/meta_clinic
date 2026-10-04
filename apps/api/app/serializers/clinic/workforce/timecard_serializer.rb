module Clinic
  module Workforce
    module TimecardSerializer
      module_function

      def call(timecard, site_id: nil, include_global_exceptions: false)
        snapshot = timecard.snapshot.deep_dup
        if site_id
          segments = Array(snapshot["segments"]).select { |segment| segment["site_id"].to_s == site_id.to_s }
          snapshot["segments"] = segments
          snapshot["totals"] = restricted_totals(segments)
          snapshot["schedule_checks"] = Array(snapshot["schedule_checks"]).select { |check| check["site_id"].to_s == site_id.to_s }
          snapshot.delete("source_punch_ids")
        end
        {
          id: timecard.id,
          scoped_site_id: site_id&.to_i,
          employment_id: timecard.employment_id,
          employee_name: timecard.employment.staff_member.display_name,
          period_start: timecard.period_start.iso8601,
          period_end: timecard.period_end.iso8601,
          version_number: timecard.version_number,
          status: timecard.status,
          source_digest: timecard.source_digest,
          unresolved_exceptions: site_id && !include_global_exceptions ? site_exceptions(snapshot) : timecard.unresolved_exceptions,
          settings_provenance: site_id ? timecard.settings_provenance.slice(site_id.to_s) : timecard.settings_provenance,
          snapshot: snapshot,
          lock_version: timecard.lock_version,
          submitted_at: timecard.submitted_at&.utc&.iso8601(6),
          approved_at: timecard.approved_at&.utc&.iso8601(6)
        }
      end

      def adjustment(adjustment)
        source_id = adjustment.proposed_changes["source_segment_id"]
        source_interval = Array(adjustment.timecard_version.snapshot["segments"])
          .find { |segment| source_id.present? && segment["id"].to_s == source_id.to_s }
        {
          id: adjustment.id,
          employment_id: adjustment.employment_id,
          employee_name: adjustment.employment.staff_member.display_name,
          timecard_version_id: adjustment.timecard_version_id,
          period_start: adjustment.timecard_version.period_start.iso8601,
          period_end: adjustment.timecard_version.period_end.iso8601,
          status: adjustment.status,
          correction_type: adjustment.correction_type,
          source_interval: source_interval&.slice("site_id", "started_at_utc", "ended_at_utc"),
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
          "rounded_minutes" => known_minutes(segments, "rounded_minutes"),
          "paid_minutes" => known_minutes(segments, "paid_minutes"),
          "regular_minutes" => configured ? segments.sum { |segment| segment["regular_minutes"].to_i } : nil,
          "overtime_minutes" => configured ? segments.sum { |segment| segment["overtime_minutes"].to_i } : nil
        }
      end
      private_class_method :restricted_totals

      def known_minutes(segments, field)
        values = segments.map { |segment| segment[field] }
        values.any?(&:nil?) ? nil : values.sum(&:to_i)
      end
      private_class_method :known_minutes

      def site_exceptions(snapshot)
        Array(snapshot["segments"]).flat_map { |segment| Array(segment["exception_codes"]) }.uniq
      end
      private_class_method :site_exceptions
    end
  end
end
