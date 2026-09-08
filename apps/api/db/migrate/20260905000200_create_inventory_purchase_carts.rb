class CreateInventoryPurchaseCarts < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_inventory_purchase_carts do |t|
      t.bigint :practice_id, :actor_id, null: false
      t.bigint :destination_site_id
      t.string :status, null: false, default: "draft"
      t.string :reason
      t.string :request_key
      t.string :checkout_group_id
      t.integer :version, null: false, default: 1
      t.timestamps
    end
    tenant_key(:clinic_inventory_purchase_carts)
    actor_key(:clinic_inventory_purchase_carts)
    add_foreign_key :clinic_inventory_purchase_carts, :clinic_sites, column: :destination_site_id
    add_index :clinic_inventory_purchase_carts, [ :practice_id, :actor_id ], unique: true, where: "status = 'draft'", name: "inventory_purchase_cart_active"
    add_index :clinic_inventory_purchase_carts, [ :practice_id, :request_key ], unique: true, where: "request_key IS NOT NULL", name: "inventory_purchase_cart_retry"
    add_index :clinic_inventory_purchase_carts, [ :practice_id, :checkout_group_id ], unique: true, where: "checkout_group_id IS NOT NULL", name: "inventory_purchase_cart_checkout_group"
    add_check_constraint :clinic_inventory_purchase_carts, "status IN ('draft','checking_out','checked_out','abandoned') AND version > 0 AND (reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 200)", name: "inventory_purchase_cart_values"

    create_table :clinic_inventory_purchase_cart_items do |t|
      t.bigint :practice_id, :cart_id, :product_id, null: false
      t.decimal :requested_packages, precision: 20, scale: 6, null: false
      t.string :input_unit, :selected_currency, :source, :status, null: false
      t.decimal :conversion_factor, :selected_unit_price, :selected_package_quantity, precision: 20, scale: 6, null: false
      t.bigint :selected_supplier_product_id, :selected_supplier_id
      t.datetime :price_snapshot_at
      t.string :price_snapshot_digest
      t.bigint :purchase_order_line_id
      t.timestamps
    end
    tenant_key(:clinic_inventory_purchase_cart_items)
    add_foreign_key :clinic_inventory_purchase_cart_items, :clinic_inventory_purchase_carts, column: [ :practice_id, :cart_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_purchase_cart_items, :clinic_pharmacy_products, column: [ :practice_id, :product_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_purchase_cart_items, :clinic_inventory_supplier_products, column: [ :practice_id, :selected_supplier_product_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_purchase_cart_items, :clinic_inventory_suppliers, column: [ :practice_id, :selected_supplier_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_purchase_cart_items, :clinic_inventory_purchase_order_lines, column: [ :practice_id, :purchase_order_line_id ], primary_key: [ :practice_id, :id ]
    add_index :clinic_inventory_purchase_cart_items, [ :practice_id, :cart_id, :product_id ], unique: true, name: "inventory_purchase_cart_item_identity"
    add_check_constraint :clinic_inventory_purchase_cart_items, "requested_packages > 0 AND conversion_factor > 0 AND selected_unit_price >= 0 AND selected_package_quantity > 0 AND length(trim(input_unit)) BETWEEN 1 AND 40 AND length(trim(selected_currency)) = 3 AND source IN ('replenishment','manual') AND status IN ('draft','checked_out','removed')", name: "inventory_purchase_cart_item_values"

    add_column :clinic_inventory_purchase_orders, :purchase_cart_id, :bigint
    add_column :clinic_inventory_purchase_orders, :checkout_group_id, :string
    add_column :clinic_inventory_purchase_orders, :source_kind, :string
    add_column :clinic_inventory_purchase_orders, :currency, :string
    add_foreign_key :clinic_inventory_purchase_orders, :clinic_inventory_purchase_carts, column: [ :practice_id, :purchase_cart_id ], primary_key: [ :practice_id, :id ]
    add_index :clinic_inventory_purchase_orders, [ :practice_id, :checkout_group_id ]

    add_column :clinic_inventory_purchase_order_lines, :cart_item_id, :bigint
    add_column :clinic_inventory_purchase_order_lines, :supplier_product_id, :bigint
    add_column :clinic_inventory_purchase_order_lines, :supplier_sku, :string
    add_column :clinic_inventory_purchase_order_lines, :ordered_package_quantity, :decimal, precision: 20, scale: 6
    add_column :clinic_inventory_purchase_order_lines, :price_snapshot_at, :datetime
    add_column :clinic_inventory_purchase_order_lines, :price_snapshot_digest, :string
    add_foreign_key :clinic_inventory_purchase_order_lines, :clinic_inventory_purchase_cart_items, column: [ :practice_id, :cart_item_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_purchase_order_lines, :clinic_inventory_supplier_products, column: [ :practice_id, :supplier_product_id ], primary_key: [ :practice_id, :id ]
    add_index :clinic_inventory_purchase_order_lines, [ :practice_id, :cart_item_id ], unique: true, where: "cart_item_id IS NOT NULL", name: "inventory_purchase_order_line_cart_item"
  end

  private

  def tenant_key(table)
    add_index table, [ :practice_id, :id ], unique: true
    add_foreign_key table, :clinic_practices, column: :practice_id
  end

  def actor_key(table)
    add_foreign_key table, :clinic_memberships, column: [ :practice_id, :actor_id ], primary_key: [ :practice_id, :user_id ]
  end
end
