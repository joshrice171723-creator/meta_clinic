class PreserveSupplierQuoteFeeEvidence < ActiveRecord::Migration[8.0]
  def change
    %i[clinic_inventory_supplier_products clinic_inventory_supplier_quote_requests clinic_inventory_purchase_order_lines].each do |table|
      add_column table, :quoted_fee_amount, :decimal, precision: 18, scale: 6
      add_column table, :quoted_fee_currency, :string, limit: 3
      add_column table, :quoted_fee_basis, :string, limit: 160
      add_check_constraint table,
        "(quoted_fee_amount IS NULL AND quoted_fee_currency IS NULL AND quoted_fee_basis IS NULL) OR " \
        "(quoted_fee_amount IS NOT NULL AND quoted_fee_amount >= 0 AND " \
        "quoted_fee_currency IS NOT NULL AND quoted_fee_currency ~ '^[A-Z]{3}$' AND quoted_fee_currency <> 'UNK' AND " \
        "quoted_fee_basis IS NOT NULL AND length(trim(quoted_fee_basis)) BETWEEN 1 AND 160)",
        name: "#{table.to_s.delete_prefix('clinic_inventory_')}_quote_fee_evidence"
    end
    add_check_constraint :clinic_inventory_supplier_products,
      "quoted_fee_amount IS NULL OR (price_source = 'manual_quote' AND quoted_fee_currency = currency)",
      name: "supplier_products_quote_fee_source"
  end
end
