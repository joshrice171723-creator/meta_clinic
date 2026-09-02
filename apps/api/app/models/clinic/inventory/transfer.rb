module Clinic
  module Inventory
    class Transfer < ApplicationRecord
      self.table_name = "clinic_inventory_transfers"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :source_batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :destination_batch, class_name: "Clinic::Inventory::PharmacyBatch"
      belongs_to :actor, class_name: "User"
    end
  end
end
