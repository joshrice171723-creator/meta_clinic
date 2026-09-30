module Clinic
  module Scheduling
    class OperationalPolicyVersion < ApplicationRecord
      self.table_name = "clinic_operational_policy_versions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :written_by_membership, class_name: "Clinic::Membership"
      validates :revision, numericality: { only_integer: true, greater_than: 0 }
      validates :effective_from, :request_key, :content_digest, presence: true
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN },
        uniqueness: { scope: %i[practice_id site_id] }
      validate :context_matches

      def self.current(practice:, site:)
        where(practice:, site:).where(effective_from: ..Current.business_time).order(revision: :desc).first
      end

      def self.snapshot(policy, site:)
        { site_id: site.id, revision: policy&.revision || 0,
          configured: policy.present?, block_categories: policy&.block_categories || [],
          waiting_thresholds: policy&.waiting_thresholds || [],
          effective_from: policy&.effective_from&.iso8601(6),
          written_by_membership_id: policy&.written_by_membership_id,
          waiting_time_source: "encounter.started_at",
          waiting_action: "display_only" }
      end

      private

      def context_matches
        if [ site, written_by_membership ].compact.any? { |record| record.practice_id != practice_id }
          errors.add(:base, "Operational policy context must belong to one clinic.")
        end
      end
    end
  end
end
