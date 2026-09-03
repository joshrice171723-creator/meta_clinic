module Clinic
  module Inventory
    class PurchaseOrderEvent < ApplicationRecord
      self.table_name = "clinic_inventory_purchase_order_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :purchase_order, class_name: "Clinic::Inventory::PurchaseOrder"
      belongs_to :actor, class_name: "User"
    end
  end
end
