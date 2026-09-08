module Clinic
  module Inventory
    class CatalogEvent < ApplicationRecord
      self.table_name = "clinic_inventory_catalog_events"
      include Clinic::TenantScoped
      include Clinic::AppendOnly

      belongs_to :product, class_name: "Clinic::Inventory::PharmacyProduct"
      belongs_to :actor, class_name: "User"
      belongs_to :profile, class_name: "Clinic::Inventory::Profile", optional: true

      validates :changed_fields, presence: true
      validate :product_belongs_to_practice

      private

      def product_belongs_to_practice
        errors.add(:product, "must belong to this practice") if product && product.practice_id != practice_id
      end
    end
  end
end
