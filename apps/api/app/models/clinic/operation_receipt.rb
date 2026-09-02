module Clinic
  class OperationReceipt < ApplicationRecord
    self.table_name = "clinic_operation_receipts"

    include Clinic::TenantScoped

    belongs_to :actor_membership, class_name: "Clinic::Membership", foreign_key: :actor_membership_id

    enum :outcome, { committed: "committed", outcome_unconfirmed: "outcome_unconfirmed" }, prefix: true, validate: true
    attr_readonly :practice_id, :actor_membership_id, :operation_code, :request_key, :payload_digest,
      :digest_algorithm, :digest_key_id, :outcome, :resource_type, :resource_id, :resource_version, :created_at, :updated_at

    validates :operation_code, :request_key, :payload_digest, :digest_algorithm, :outcome, presence: true
    validates :operation_code, format: { with: /\A[a-z][a-z0-9_.-]{0,119}\z/ }
    validates :request_key, format: { with: /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/ }
    validates :payload_digest, format: { with: /\A[0-9a-f]{64}\z/ }
    validates :digest_algorithm, inclusion: { in: %w[sha256-v0 hmac-sha256-v1] }
    validates :digest_key_id, absence: true, if: -> { digest_algorithm == "sha256-v0" }
    validates :digest_key_id, presence: true, length: { maximum: 120 }, format: { with: /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}\z/ },
      if: -> { digest_algorithm == "hmac-sha256-v1" }
    validates :resource_type, format: { with: /\A[A-Z][A-Za-z0-9_:]{0,119}\z/ }, allow_nil: true
    validates :resource_id, numericality: { only_integer: true, greater_than: 0 }, allow_nil: true
    validates :resource_version, length: { maximum: 160 }, allow_nil: true
    validate :actor_membership_belongs_to_practice

    before_update { throw :abort }
    before_destroy { throw :abort }

    private

    def actor_membership_belongs_to_practice
      return unless actor_membership

      errors.add(:actor_membership, "must belong to this practice") if actor_membership.practice_id != practice_id
    end
  end
end
