class SnapshotQuoteRequestPackageQuantity < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_inventory_supplier_quote_requests, :package_quantity_at_request, :decimal, precision: 20, scale: 6
    add_check_constraint :clinic_inventory_supplier_quote_requests,
      "package_quantity_at_request IS NULL OR package_quantity_at_request > 0",
      name: "inventory_supplier_quote_request_package_quantity"
  end
end
