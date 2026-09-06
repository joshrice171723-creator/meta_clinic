module Clinic
  module Inventory
    class SupplierProduct < ApplicationRecord
      self.table_name = "clinic_inventory_supplier_products"
      ACTIVE_CONTRACT_STATUS = "active".freeze
      PURCHASE_ORDERING_UNIT = "package".freeze
      UNKNOWN_CURRENCY = "UNK".freeze
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

      scope :eligible_for_purchase, ->(on:) do
        joins(:product, :supplier).merge(PharmacyProduct.where(active: true))
          .where("clinic_pharmacy_products.practice_id = clinic_inventory_supplier_products.practice_id")
          .where("clinic_inventory_suppliers.practice_id = clinic_inventory_supplier_products.practice_id")
          .where(available: true, contract_status: ACTIVE_CONTRACT_STATUS, ordering_unit: PURCHASE_ORDERING_UNIT)
          .where.not(currency: UNKNOWN_CURRENCY)
          .where("clinic_inventory_supplier_products.effective_date IS NULL OR clinic_inventory_supplier_products.effective_date <= ?", on)
      end

      def purchase_eligibility_reason(on:)
        return "No catalog item matches this NDC." unless product
        return "The catalog item does not belong to this clinic." unless product.practice_id == practice_id
        return "The supplier is unavailable." unless supplier
        return "The supplier does not belong to this clinic." unless supplier.practice_id == practice_id
        return "The catalog item is inactive." unless product.active?
        return "Availability is not confirmed." if available.nil?
        return "This offer is unavailable." unless available?
        return "The supplier contract is not active." unless contract_status == ACTIVE_CONTRACT_STATUS
        return "The ordering unit is not a package." unless ordering_unit == PURCHASE_ORDERING_UNIT
        return "Currency is not confirmed." if currency.blank? || currency == UNKNOWN_CURRENCY
        return "This offer is not effective until #{effective_date.iso8601}." if effective_date && effective_date > on

        nil
      end
    end
  end
end
