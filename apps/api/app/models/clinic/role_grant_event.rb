module Clinic
  class RoleGrantEvent < ApplicationRecord
    self.table_name = "clinic_role_grant_events"
    include TenantScoped
    include AppendOnly

    belongs_to :grant, class_name: "Clinic::RoleGrant"
    belongs_to :grantor_membership, class_name: "Clinic::Membership"

    validates :grant_revision, numericality: { only_integer: true, greater_than: 0 }
    validates :event_kind, presence: true
    validate :grantor_belongs_to_practice

    private

    def grantor_belongs_to_practice
      errors.add(:grantor_membership, "must belong to this practice") if grantor_membership && grantor_membership.practice_id != practice_id
    end
  end
end
