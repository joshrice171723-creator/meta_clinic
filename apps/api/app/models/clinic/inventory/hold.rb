module Clinic
  module Inventory
    class Hold < ApplicationRecord
      self.table_name = "clinic_inventory_holds"
      belongs_to :batch, class_name: "Clinic::Inventory::PharmacyBatch"
      scope :active, -> { where("NOT EXISTS (SELECT 1 FROM clinic_inventory_hold_releases r WHERE r.hold_id=clinic_inventory_holds.id)") }
      validates :reason, presence: true, length: { maximum: 200 }
      validates :kind, inclusion: { in: %w[quarantined recalled temperature damaged] }
    end
  end
end
