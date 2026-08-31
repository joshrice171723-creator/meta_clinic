module Clinic
  class Practice < ApplicationRecord
    self.table_name = "clinic_practices"
    has_many :memberships, class_name: "Clinic::Membership", dependent: :restrict_with_error
    has_many :patients, class_name: "Clinic::Care::Patient", dependent: :restrict_with_error
    has_many :items, class_name: "Clinic::Inventory::Item", dependent: :restrict_with_error
    has_many :staff_members, class_name: "Clinic::Staff::Member", dependent: :restrict_with_error
    has_many :inventory_profiles, class_name: "Clinic::Inventory::Profile"
    after_create { inventory_profiles.create!(version: 1, reason: "New synthetic clinic inventory baseline") }

    def inventory_date
      Time.current.in_time_zone(timezone).to_date
    end

    validates :timezone, inclusion: { in: ActiveSupport::TimeZone::MAPPING.values + [ "UTC" ] }
    validates :name, presence: true, length: { maximum: 120 }
  end
end
