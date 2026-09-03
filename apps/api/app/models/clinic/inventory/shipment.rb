module Clinic
  module Inventory
    class Shipment < ApplicationRecord
      self.table_name = "clinic_inventory_shipments"
      include Clinic::TenantScoped
      include Clinic::AppendOnly
      belongs_to :purchase_order, class_name: "Clinic::Inventory::PurchaseOrder"
      belongs_to :actor, class_name: "User"
      has_many :receipts, class_name: "Clinic::Inventory::Receipt", foreign_key: :shipment_id, dependent: :restrict_with_error
      has_many :shipment_lines, class_name: "Clinic::Inventory::ShipmentLine", foreign_key: :shipment_id, dependent: :restrict_with_error

      def effective_status
        receipts.exists? ? "received" : status
      end
    end
  end
end
