class AddInventoryDeviceIdentifier < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_pharmacy_products, :device_identifier, :string
    add_index :clinic_pharmacy_products, [ :practice_id, :device_identifier ], unique: true
    remove_check_constraint :clinic_pharmacy_products, name: "pharmacy_product_source"
    add_check_constraint :clinic_pharmacy_products, "source IN ('manual', 'openfda', 'gudid', 'synthetic')", name: "pharmacy_product_source"
  end
end
