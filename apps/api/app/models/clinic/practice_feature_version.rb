module Clinic
  class PracticeFeatureVersion < ApplicationRecord
    self.table_name = "clinic_practice_feature_versions"
    include TenantScoped
    include AppendOnly

    belongs_to :practice, class_name: "Clinic::Practice"
    belongs_to :recorded_by_membership, class_name: "Clinic::Membership"

    validates :version, numericality: { only_integer: true, greater_than: 0 }
    validates :reason, presence: true, length: { maximum: 240 }
    validates :request_key, presence: true, length: { maximum: 160 }, uniqueness: { scope: :practice_id }
    validates :content_digest, format: { with: /\A[0-9a-f]{64}\z/ }
    validates :effective_from, presence: true
    validate :recorder_belongs_to_practice

    scope :effective_at, ->(at) { where(effective_from: ..at) }

    private

    def recorder_belongs_to_practice
      if recorded_by_membership && recorded_by_membership.practice_id != practice_id
        errors.add(:recorded_by_membership, "must belong to this practice")
      end
    end
  end
end
