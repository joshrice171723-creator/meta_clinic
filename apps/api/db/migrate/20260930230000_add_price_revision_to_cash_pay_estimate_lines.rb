class AddPriceRevisionToCashPayEstimateLines < ActiveRecord::Migration[8.1]
  def change
    # Existing snapshots cannot be assigned today's catalog revision retroactively.
    add_column :clinic_cash_pay_estimate_lines, :source_price_revision, :integer
    add_check_constraint :clinic_cash_pay_estimate_lines,
      "source_price_revision IS NULL OR (source_price_revision >= 0 AND billing_service_id IS NOT NULL)",
      name: "cash_pay_estimate_lines_price_revision"
  end
end
