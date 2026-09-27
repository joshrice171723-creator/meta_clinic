class AddManualSupplierQuoteProvenance < ActiveRecord::Migration[8.0]
  def change
    add_column :clinic_inventory_supplier_products, :price_source, :string, null: false, default: "price_sheet"
    add_column :clinic_inventory_supplier_products, :quote_reference, :string
    add_column :clinic_inventory_supplier_products, :quoted_on, :date
    add_check_constraint :clinic_inventory_supplier_products,
      "(price_source = 'price_sheet' AND quote_reference IS NULL AND quoted_on IS NULL) OR " \
      "(price_source = 'manual_quote' AND length(trim(quote_reference)) BETWEEN 1 AND 120 AND quoted_on IS NOT NULL)",
      name: "inventory_supplier_price_source"

    add_column :clinic_inventory_purchase_order_lines, :quote_reference, :string
    add_column :clinic_inventory_purchase_order_lines, :quoted_on, :date
  end
end
