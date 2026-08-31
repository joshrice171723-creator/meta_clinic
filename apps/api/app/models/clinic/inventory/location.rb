module Clinic
  module Inventory
    class Location < ApplicationRecord
      self.table_name = "clinic_inventory_locations"
      validates :name, presence: true, length: { maximum: 100 }
    end
  end
end
