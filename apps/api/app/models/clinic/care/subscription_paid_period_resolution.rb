module Clinic
  module Care
    class SubscriptionPaidPeriodResolution < ApplicationRecord
      self.table_name = "clinic_subscription_paid_period_resolutions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :agreement, class_name: "Clinic::Care::SubscriptionAgreement"
      belongs_to :service, class_name: "Clinic::Care::ServiceOption"
      belongs_to :selected_paid_event, class_name: "Clinic::Care::SubscriptionEvent"
      belongs_to :actor, class_name: "User"

      validates :request_key, presence: true, length: { maximum: 160 },
        format: { with: /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/ }
      validates :evidence_token, presence: true, format: { with: /\A[0-9a-f]{64}\z/ }
      validates :reason, presence: true, length: { maximum: 1000 }
      validates :overlap_start, :overlap_end, :effective_at, presence: true
      validate :retained_evidence_shape

      private

      def retained_evidence_shape
        ids = candidate_event_ids
        unless ids.is_a?(Array) && ids.length >= 2 && ids.uniq.length == ids.length &&
          ids.all? { |id| id.is_a?(Integer) && id.positive? && id <= 9_223_372_036_854_775_807 } &&
          ids.include?(selected_paid_event_id)
          errors.add(:candidate_event_ids, "must contain distinct paid event IDs including the selected event")
        end
        errors.add(:evidence_snapshot, "must be an object") unless evidence_snapshot.is_a?(Hash)
        return unless overlap_start && overlap_end && effective_at
        unless overlap_start <= effective_at && effective_at < overlap_end
          errors.add(:effective_at, "must be within the half-open overlap interval")
        end
      end
    end
  end
end
