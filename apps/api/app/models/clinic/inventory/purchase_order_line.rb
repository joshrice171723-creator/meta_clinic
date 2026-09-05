module Clinic
  module Inventory
    class PurchaseOrderLine < ApplicationRecord
      self.table_name = "clinic_inventory_purchase_order_lines"
      include Clinic::TenantScoped
      belongs_to :purchase_order, class_name: "Clinic::Inventory::PurchaseOrder"
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      belongs_to :cart_item, class_name: "Clinic::Inventory::PurchaseCartItem", optional: true
      belongs_to :supplier_product, class_name: "Clinic::Inventory::SupplierProduct", optional: true
      def remaining_quantity = ordered_quantity - received_quantity
      def ordered_units = ordered_quantity * conversion_factor
      def received_units = received_quantity * conversion_factor
    end
  end
end
