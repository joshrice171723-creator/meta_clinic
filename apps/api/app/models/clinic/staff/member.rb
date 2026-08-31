module Clinic
  module Staff
    class Member < ApplicationRecord
      self.table_name = "clinic_staff_members"
      belongs_to :practice, class_name: "Clinic::Practice"
      include Clinic::Auditable
      has_many :address_versions, class_name: "Clinic::Staff::AddressVersion", dependent: :restrict_with_error
      belongs_to :primary_address_version, class_name: "Clinic::Staff::AddressVersion", optional: true
      encrypts :display_name
      validates :display_name, :job_title, presence: true, length: { maximum: 120 }
    end
  end
end
