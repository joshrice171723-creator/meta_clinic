class CreateInventorySupplierQuoteRequests < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_inventory_supplier_quote_requests do |t|
      t.bigint :practice_id, :supplier_product_id, :supplier_id, :product_id, null: false
      t.decimal :requested_packages, precision: 20, scale: 6, null: false
      t.text :note, null: false, default: ""
      t.string :status, null: false, default: "open"
      t.string :request_key, null: false
      t.string :quote_reference
      t.date :quoted_on
      t.timestamps
    end

    add_index :clinic_inventory_supplier_quote_requests, [ :practice_id, :status, :created_at, :id ], name: "inventory_supplier_quote_requests_listing"
    add_index :clinic_inventory_supplier_quote_requests, [ :practice_id, :supplier_product_id, :status ], name: "inventory_supplier_quote_requests_offer"
    add_foreign_key :clinic_inventory_supplier_quote_requests, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_inventory_supplier_quote_requests, :clinic_inventory_supplier_products,
      column: [ :practice_id, :supplier_product_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_supplier_quote_requests, :clinic_inventory_suppliers,
      column: [ :practice_id, :supplier_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_supplier_quote_requests, :clinic_pharmacy_products,
      column: [ :practice_id, :product_id ], primary_key: [ :practice_id, :id ]
    add_check_constraint :clinic_inventory_supplier_quote_requests,
      "requested_packages > 0 AND requested_packages = round(requested_packages,0) AND length(trim(note)) BETWEEN 1 AND 1000 AND length(trim(request_key)) BETWEEN 1 AND 160 AND " \
      "((status = 'open' AND quote_reference IS NULL AND quoted_on IS NULL) OR (status = 'quoted' AND length(trim(quote_reference)) BETWEEN 1 AND 120 AND quoted_on IS NOT NULL))",
      name: "inventory_supplier_quote_request_values"
  end
end
