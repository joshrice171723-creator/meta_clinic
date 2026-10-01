module Clinic
  module Reminders
    class PolicyVersion < ApplicationRecord
      self.table_name = "clinic_reminder_policy_versions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :written_by_membership, class_name: "Clinic::Membership"
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validates :enabled, inclusion: { in: [ true, false ] }
      validates :lead_hours, numericality: { only_integer: true, in: 1..168 }
      validates :effective_from, :request_key, :content_digest, presence: true
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN }, uniqueness: { scope: :practice_id }
      validate :membership_matches

      def self.current(practice:, at: Current.business_time)
        where(practice:).where(effective_from: ..at).order(revision: :desc).first
      end

      def self.snapshot(policy)
        { revision: policy&.revision || 0, enabled: policy ? policy.enabled : true,
          lead_hours: policy&.lead_hours || 24, channel: "sms",
          effective_from: policy&.effective_from&.iso8601(6), written_by_membership_id: policy&.written_by_membership_id }
      end

      private

      def membership_matches
        errors.add(:written_by_membership, "must belong to this practice") unless written_by_membership&.practice_id == practice_id
      end
    end
  end
end
