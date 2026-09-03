module Clinic
  module Inventory
    class RecallLot < ApplicationRecord
      self.table_name = "clinic_inventory_recall_lots"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :recall, class_name: "Clinic::Inventory::Recall"
      belongs_to :lot, class_name: "Clinic::Inventory::Lot"
    end
  end
end
