class AddPreferredSupplierToPharmacyProducts < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_pharmacy_products, :preferred_supplier_id, :bigint
    add_index :clinic_pharmacy_products, [ :practice_id, :preferred_supplier_id ]
    add_foreign_key :clinic_pharmacy_products, :clinic_inventory_suppliers,
      column: [ :practice_id, :preferred_supplier_id ], primary_key: [ :practice_id, :id ],
      name: "fk_pharmacy_products_preferred_supplier"
  end
end
