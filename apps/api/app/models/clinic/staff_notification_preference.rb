module Clinic
  class StaffNotificationPreference < ApplicationRecord
    self.table_name = "clinic_staff_notification_preferences"
    include TenantScoped
    include Auditable

    belongs_to :membership, class_name: "Clinic::Membership"

    validates :routine_enabled, inclusion: { in: [ true, false ] }
    validates :urgent_enabled, inclusion: { in: [ true, false ] }
    validate :membership_belongs_to_practice

    private

    def membership_belongs_to_practice
      errors.add(:membership, "must belong to this practice") if membership && membership.practice_id != practice_id
    end
  end
end
