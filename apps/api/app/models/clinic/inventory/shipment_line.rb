module Clinic
  module Inventory
    class ShipmentLine < ApplicationRecord
      self.table_name = "clinic_inventory_shipment_lines"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :shipment, class_name: "Clinic::Inventory::Shipment"
      belongs_to :purchase_order_line, class_name: "Clinic::Inventory::PurchaseOrderLine"
      validates :expected_packages, numericality: { greater_than: 0 }
      validates :shipment_id, uniqueness: { scope: :practice_id }
    end
  end
end
