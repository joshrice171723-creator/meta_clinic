module Clinic
  module Inventory
    class PharmacyProduct < ApplicationRecord
      self.table_name = "clinic_pharmacy_products"
      include Clinic::TenantScoped
      include Clinic::Auditable
      has_many :batches, class_name: "Clinic::Inventory::PharmacyBatch", foreign_key: :product_id, dependent: :restrict_with_error
      has_many :lots, class_name: "Clinic::Inventory::Lot", foreign_key: :product_id, dependent: :restrict_with_error
      has_many :catalog_events, class_name: "Clinic::Inventory::CatalogEvent", foreign_key: :product_id, dependent: :restrict_with_error
      validates :name, :sku, presence: true, length: { maximum: 160 }
      validates :sku, uniqueness: { scope: :practice_id }
      validates :ndc, uniqueness: { scope: :practice_id }, allow_nil: true
      validates :generic_name, :dosage_form, :route, :labeler, length: { maximum: 500 }
      validates :ingredients, :package_description, length: { maximum: 4000 }
      validates :ndc, :product_ndc, length: { maximum: 30 }
      validates :source, inclusion: { in: %w[manual openfda synthetic] }
      validates :dea_schedule, inclusion: { in: %w[II III IV V] }, allow_nil: true
      validates :reorder_point, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1_000_000 }

      validates :stock_unit, inclusion: { in: %w[package each tablet capsule vial mL g] }
      validates :quantity_scale, inclusion: { in: 0..6 }
      validates :package_size, numericality: { greater_than: 0, less_than_or_equal_to: 1_000_000 }
      validates :unit_reference, presence: true, if: -> { package_size != 1 }
      validates :unit_reference, length: { maximum: 500 }
      validate do
        errors.add(:quantity_scale, "must be zero for countable units") if !%w[mL g].include?(stock_unit) && quantity_scale != 0
        errors.add(:package_size, "must match the selected quantity precision") if package_size && quantity_scale && package_size != package_size.round(quantity_scale.clamp(0, 6))
        errors.add(:package_size, "must be one when stock is tracked as packages") if stock_unit == "package" && package_size != 1
      end

      def self.with_stock(day)
        date = connection.quote(day)
        usable = "#{PharmacyBatch::NO_HOLD_SQL} AND clinic_pharmacy_batches.expires_on >= #{date} AND clinic_pharmacy_products.active"
        left_joins(:batches).group("clinic_pharmacy_products.id").select("clinic_pharmacy_products.*",
          "COALESCE(SUM(clinic_pharmacy_batches.on_hand),0) AS physical_stock",
          "COALESCE(SUM(CASE WHEN #{usable} THEN clinic_pharmacy_batches.on_hand ELSE 0 END),0) AS available_stock",
          "MIN(CASE WHEN #{usable} AND clinic_pharmacy_batches.on_hand>0 THEN clinic_pharmacy_batches.expires_on END) AS next_expiry",
          "array_remove(array_agg(DISTINCT CASE WHEN clinic_pharmacy_batches.on_hand>0 THEN clinic_pharmacy_batches.location END),NULL) AS stock_locations")
      end

      def available_quantity
        return self[:available_stock] if has_attribute?(:available_stock)
        return 0 unless active?
        batches.usable(practice.inventory_date).sum(:on_hand)
      end

      def on_hand_quantity
        has_attribute?(:physical_stock) ? self[:physical_stock] : batches.sum(:on_hand)
      end

      def low_stock?
        active? && available_quantity <= reorder_point
      end

      def update_catalog!(attributes, actor:)
        Clinic::Inventory::Access.with(practice_id, actor, "catalog") do
          with_lock do
            connection = self.class.connection
            connection.transaction(requires_new: true) do
              previous_actor = connection.select_value("SELECT current_setting('apply.inventory_actor', true)")
              connection.execute("SELECT set_config('apply.inventory_actor', #{connection.quote(actor.id.to_s)}, true)")
              update!(attributes)
              connection.execute("SELECT set_config('apply.inventory_actor', #{connection.quote(previous_actor.to_s)}, true)")
            end
          end
        end
      end
    end
  end
end
