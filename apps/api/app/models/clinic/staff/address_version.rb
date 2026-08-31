module Clinic
  module Staff
    class AddressVersion < ApplicationRecord
      self.table_name = "clinic_staff_address_versions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :staff_member, class_name: "Clinic::Staff::Member"
      validates :version, numericality: { only_integer: true, greater_than: 0 }
      validates :encrypted_address, presence: true
      scope :chronological, -> { order(:version) }
    end
  end
end
