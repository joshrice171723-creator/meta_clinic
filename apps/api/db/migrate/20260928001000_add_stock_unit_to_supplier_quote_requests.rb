class AddStockUnitToSupplierQuoteRequests < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_inventory_supplier_quote_requests, :stock_unit_at_request, :string
    add_check_constraint :clinic_inventory_supplier_quote_requests,
      "stock_unit_at_request IS NULL OR stock_unit_at_request IN ('package','each','tablet','capsule','vial','mL','g')",
      name: "inventory_supplier_quote_request_stock_unit"
  end
end
