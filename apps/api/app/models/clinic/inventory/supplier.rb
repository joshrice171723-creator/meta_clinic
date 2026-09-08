module Clinic
  module Inventory
    class Supplier < ApplicationRecord
      self.table_name = "clinic_inventory_suppliers"
      include Clinic::TenantScoped
      include Clinic::Auditable
      has_many :address_versions, class_name: "Clinic::Inventory::SupplierAddressVersion", dependent: :restrict_with_error
      has_many :supplier_products, class_name: "Clinic::Inventory::SupplierProduct", dependent: :restrict_with_error
      belongs_to :primary_address_version, class_name: "Clinic::Inventory::SupplierAddressVersion", optional: true
      has_many :receipts, class_name: "Clinic::Inventory::Receipt", dependent: :restrict_with_error
      validates :name, presence: true, length: { maximum: 120 }
    end
  end
end
