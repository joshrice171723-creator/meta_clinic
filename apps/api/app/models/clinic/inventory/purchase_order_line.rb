module Clinic
  module Inventory
    class PurchaseOrderLine < ApplicationRecord
      self.table_name = "clinic_inventory_purchase_order_lines"
      include Clinic::TenantScoped
      belongs_to :purchase_order, class_name: "Clinic::Inventory::PurchaseOrder"
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      def remaining_quantity = ordered_quantity - received_quantity
      def ordered_units = ordered_quantity * conversion_factor
      def received_units = received_quantity * conversion_factor
    end
  end
end
