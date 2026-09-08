class CreateInventorySupplierProducts < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_inventory_supplier_products do |t|
      t.bigint :practice_id, :supplier_id, null: false
      t.bigint :product_id
      t.string :ndc, :supplier_sku, :description, :ordering_unit, :currency, :contract_status, null: false
      t.decimal :package_quantity, :wholesale_unit_cost, precision: 20, scale: 6, null: false
      t.boolean :available
      t.integer :lead_time_days
      t.date :effective_date
      t.datetime :imported_at, null: false
      t.timestamps
    end

    add_index :clinic_inventory_supplier_products, [ :practice_id, :id ], unique: true
    add_index :clinic_inventory_supplier_products, [ :practice_id, :supplier_id, :ndc, :supplier_sku ], unique: true, name: "inventory_supplier_product_identity"
    add_index :clinic_inventory_supplier_products, [ :practice_id, :product_id ]
    add_foreign_key :clinic_inventory_supplier_products, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_inventory_supplier_products, :clinic_inventory_suppliers, column: [ :practice_id, :supplier_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_supplier_products, :clinic_pharmacy_products, column: [ :practice_id, :product_id ], primary_key: [ :practice_id, :id ]
    add_check_constraint :clinic_inventory_supplier_products, "length(trim(ndc)) = 11 AND ndc ~ '^[0-9]{11}$' AND length(trim(supplier_sku)) BETWEEN 1 AND 120 AND length(trim(description)) BETWEEN 1 AND 400 AND length(trim(ordering_unit)) BETWEEN 1 AND 40 AND length(trim(currency)) = 3 AND package_quantity > 0 AND wholesale_unit_cost >= 0 AND wholesale_unit_cost = round(wholesale_unit_cost,6) AND (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 3650) AND length(trim(contract_status)) BETWEEN 1 AND 40", name: "inventory_supplier_product_values"
  end
end
