module Clinic
  module Scheduling
    class WalkInException < ApplicationRecord
      self.table_name = "clinic_appointment_walk_in_exceptions"
      include TenantScoped

      belongs_to :appointment, class_name: "Clinic::Appointment"
      belongs_to :site, class_name: "Clinic::Site"
      belongs_to :written_by_membership, class_name: "Clinic::Membership"

      encrypts :reason
      validates :reason, presence: true, length: { maximum: 500 }
    end
  end
end
