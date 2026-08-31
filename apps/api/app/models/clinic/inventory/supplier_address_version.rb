module Clinic
  module Inventory
    class SupplierAddressVersion < ApplicationRecord
      self.table_name = "clinic_supplier_address_versions"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :supplier, class_name: "Clinic::Inventory::Supplier"
      validates :version, numericality: { only_integer: true, greater_than: 0 }
      validates :encrypted_address, presence: true
      scope :chronological, -> { order(:version) }
    end
  end
end
