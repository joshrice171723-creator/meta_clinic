module Clinic
  class StaffMember < ApplicationRecord
    self.table_name = "clinic_staff_members"
    belongs_to :practice, class_name: "Clinic::Practice"
    encrypts :display_name
    validates :display_name, :job_title, presence: true, length: { maximum: 120 }
  end
end
