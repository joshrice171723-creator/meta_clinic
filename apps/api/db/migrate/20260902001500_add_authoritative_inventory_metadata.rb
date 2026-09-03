class AddAuthoritativeInventoryMetadata < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_pharmacy_products, :dea_schedule, :string
    add_check_constraint :clinic_pharmacy_products, "dea_schedule IS NULL OR dea_schedule IN ('II','III','IV','V')", name: "pharmacy_product_dea_schedule"
    add_column :clinic_inventory_locations, :kind, :string
    add_check_constraint :clinic_inventory_locations, "kind IS NULL OR length(trim(kind)) BETWEEN 1 AND 60", name: "inventory_location_kind"
  end
end
