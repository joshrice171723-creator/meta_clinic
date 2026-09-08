module Clinic
  module Inventory
    class PurchaseCartItem < ApplicationRecord
      self.table_name = "clinic_inventory_purchase_cart_items"
      include Clinic::TenantScoped

      belongs_to :cart, class_name: "Clinic::Inventory::PurchaseCart"
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      belongs_to :selected_supplier_product, class_name: "Clinic::Inventory::SupplierProduct", optional: true
      belongs_to :selected_supplier, class_name: "Clinic::Inventory::Supplier", optional: true
      belongs_to :purchase_order_line, class_name: "Clinic::Inventory::PurchaseOrderLine", optional: true

      validates :requested_packages, numericality: { greater_than: 0, less_than_or_equal_to: 1_000_000 }
      validates :input_unit, inclusion: { in: [ "package" ] }
      validates :source, inclusion: { in: %w[replenishment manual] }
      validates :status, inclusion: { in: %w[draft checked_out removed] }
      validates :selected_currency, format: { with: /\A[A-Z]{3}\z/ }
    end
  end
end
