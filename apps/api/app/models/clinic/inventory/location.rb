module Clinic
  module Inventory
    class Location < ApplicationRecord
      self.table_name = "clinic_inventory_locations"
      include Clinic::TenantScoped
      include Clinic::Auditable
      has_many :batches, class_name: "Clinic::Inventory::PharmacyBatch", foreign_key: :location_id, dependent: :restrict_with_error
      validates :name, presence: true, length: { maximum: 100 }
    end
  end
end
