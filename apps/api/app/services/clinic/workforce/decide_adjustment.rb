module Clinic
  module Workforce
    class DecideAdjustment
      def self.call(adjustment:, reviewer:, decision:, decision_reason:, expected_lock_version:)
        raise ArgumentError, "Decision must be approved or denied" unless %w[approved denied].include?(decision)
        reason = decision_reason.to_s.strip
        raise ArgumentError, "A decision reason is required" if reason.blank?
        expected = Integer(expected_lock_version)

        AdjustmentRequest.transaction do
          adjustment.lock!
          raise ArgumentError, "Reviewer belongs to another practice" unless reviewer.practice_id == adjustment.practice_id
          raise ArgumentError, "The requester cannot decide the same correction" if reviewer.id == adjustment.requested_by_membership_id

          if adjustment.status != "submitted"
            if adjustment.status == decision && adjustment.reviewed_by_membership_id == reviewer.id &&
                adjustment.decision_reason == reason && adjustment.lock_version == expected + 1
              return adjustment
            end
            raise ActiveRecord::StaleObjectError.new(adjustment, "decide")
          end
          raise ActiveRecord::StaleObjectError.new(adjustment, "decide") unless adjustment.lock_version == expected

          reviewed_at = Current.business_time.floor(6)
          resulting = if decision == "approved"
            CalculateTimecard.call(
              employment: adjustment.employment,
              period_start: adjustment.timecard_version.period_start,
              actor_membership: reviewer,
              pending_adjustment: adjustment,
              pending_reviewed_at: reviewed_at
            )
          end
          adjustment.update!(
            status: decision,
            reviewed_by_membership: reviewer,
            reviewed_at: reviewed_at,
            decision_reason: reason,
            resulting_timecard_version: resulting
          )
          adjustment
        end
      end
    end
  end
end
