module Clinic
  module Scheduling
    # A display-only operational comparison, never a clinical escalation action.
    class WaitingPolicyProjection
      def self.call(encounter:, nurse_stage:, policy:, as_of:)
        result = { state: "not_applicable", policy_revision: policy&.revision || 0,
          elapsed_minutes: nil, time_source: "encounter.started_at", matched_threshold: nil, action: "display_only" }
        return result unless encounter.status == "open" && nurse_stage == "waiting" && encounter.room_id.nil?
        unless policy && policy.practice_id == encounter.practice_id && policy.site_id == encounter.site_id
          return result.merge(state: "unconfigured")
        end
        return result.merge(state: "unconfigured") if policy.waiting_thresholds.empty?
        origin = encounter.started_at
        return result.merge(state: "origin_unknown") unless origin && origin <= as_of
        minutes = ((as_of - origin) / 60).floor
        matched = policy.waiting_thresholds.select { |row| row.fetch("minutes") <= minutes }.max_by { |row| row.fetch("minutes") }
        result.merge(state: matched ? "threshold_met" : "below_threshold", elapsed_minutes: minutes,
          matched_threshold: matched)
      end
    end
  end
end
