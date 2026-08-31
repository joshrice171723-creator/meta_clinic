module Clinic
  module Inventory
    class HoldRelease < ApplicationRecord
      self.table_name = "clinic_inventory_hold_releases"
      validates :reason, presence: true, length: { maximum: 200 }
    end
  end
end
