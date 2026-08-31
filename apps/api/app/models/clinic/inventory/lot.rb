module Clinic
  module Inventory
    class Lot < ApplicationRecord
      self.table_name = "clinic_inventory_lots"
      validates :number, presence: true, length: { maximum: 100 }
      validates :expires_on, presence: true
      validates :expiry_precision, inclusion: { in: %w[day month] }
    end
  end
end
