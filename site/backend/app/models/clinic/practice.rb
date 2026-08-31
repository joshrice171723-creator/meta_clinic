module Clinic
  class Practice < ApplicationRecord
    self.table_name = "clinic_practices"
    has_many :memberships, class_name: "Clinic::Membership", dependent: :restrict_with_error
    has_many :patients, class_name: "Clinic::Patient", dependent: :restrict_with_error
    has_many :items, class_name: "Clinic::Item", dependent: :restrict_with_error
    has_many :staff_members, class_name: "Clinic::StaffMember", dependent: :restrict_with_error
    validates :name, presence: true, length: { maximum: 120 }
  end
end
