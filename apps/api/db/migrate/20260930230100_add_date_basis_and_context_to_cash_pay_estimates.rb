class AddDateBasisAndContextToCashPayEstimates < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_cash_pay_estimate_lines, :date_basis, :string, limit: 500
    add_column :clinic_cash_pay_estimates, :payment_context, :string, default: "unknown", null: false
    add_column :clinic_cash_pay_estimates, :request_context, :string, limit: 500
    add_column :clinic_cash_pay_estimates, :scheduled_context, :string, limit: 500
    add_check_constraint :clinic_cash_pay_estimates,
      "payment_context IN ('unknown', 'uninsured', 'self_pay', 'other')",
      name: "cash_pay_estimates_payment_context"
  end
end
