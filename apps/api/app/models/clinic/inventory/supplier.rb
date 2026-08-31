module Clinic
  module Inventory
    class Supplier < ApplicationRecord
      self.table_name = "clinic_inventory_suppliers"
      validates :name, presence: true, length: { maximum: 120 }
    end
  end
end
