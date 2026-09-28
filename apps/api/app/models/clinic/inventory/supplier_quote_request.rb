module Clinic
  module Inventory
    class SupplierQuoteRequest < ApplicationRecord
      self.table_name = "clinic_inventory_supplier_quote_requests"
      include Clinic::TenantScoped
      include Clinic::Auditable

      attr_readonly :supplier_product_id, :supplier_id, :product_id, :requested_packages, :note, :request_key

      belongs_to :supplier_product, class_name: "Clinic::Inventory::SupplierProduct"
      belongs_to :supplier, class_name: "Clinic::Inventory::Supplier"
      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"

      validates :requested_packages, numericality: { greater_than: 0 }
      validates :note, presence: true, length: { maximum: 1000 }
      validates :request_key, format: { with: Clinic::Idempotency::KEY_PATTERN }
      validates :status, inclusion: { in: %w[open quoted] }
      validates :quote_reference, presence: true, length: { maximum: 120 }, if: -> { status == "quoted" }
      validates :quoted_on, presence: true, if: -> { status == "quoted" }
      validate :matches_supplier_product
      validate :whole_package_quantity

      private

      def whole_package_quantity
        return if requested_packages.nil? || requested_packages == requested_packages.to_i

        errors.add(:requested_packages, "must be an integer")
      end

      def matches_supplier_product
        return unless supplier_product

        errors.add(:supplier_id, "must match the supplier offer") unless supplier_id == supplier_product.supplier_id
        errors.add(:product_id, "must match the supplier offer") unless product_id == supplier_product.product_id
      end
    end
  end
end
