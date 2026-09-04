module Clinic
  module Inventory
    class SupplierProduct < ApplicationRecord
      self.table_name = "clinic_inventory_supplier_products"
      include Clinic::TenantScoped
      include Clinic::Auditable

      belongs_to :supplier, class_name: "Clinic::Inventory::Supplier"
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct", optional: true

      validates :ndc, format: { with: /\A\d{11}\z/ }
      validates :supplier_sku, :description, :ordering_unit, :currency, :contract_status, presence: true
      validates :currency, format: { with: /\A[A-Z]{3}\z/ }
      validates :package_quantity, numericality: { greater_than: 0 }
      validates :wholesale_unit_cost, numericality: { greater_than_or_equal_to: 0 }
      validates :lead_time_days, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 3650 }, allow_nil: true
    end
  end
end
