module Clinic
  class OfferingTextBatch < ApplicationRecord
    self.table_name = "clinic_offering_text_batches"
    include Clinic::TenantScoped
    belongs_to :actor_membership, class_name: "Clinic::Membership"
    belongs_to :actor, class_name: "User"
    belongs_to :site, class_name: "Clinic::Site", optional: true
    encrypts :document
    attr_readonly :practice_id, :actor_membership_id, :actor_id, :site_id,
      :authorization_generation, :request_key, :plan_digest, :created_at
    validates :document, presence: true
    validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN }
    validates :plan_digest, format: { with: /\A[a-f0-9]{64}\z/ }
    validates :authorization_generation, numericality: { only_integer: true, greater_than: 0 }
    validate do
      if actor_membership && (actor_membership.practice_id != practice_id || actor_membership.user_id != actor_id)
        errors.add(:actor_membership, "must match the original actor and practice")
      end
      errors.add(:site, "must belong to the practice") if site && site.practice_id != practice_id
    end
    before_destroy { throw :abort }
  end
end
