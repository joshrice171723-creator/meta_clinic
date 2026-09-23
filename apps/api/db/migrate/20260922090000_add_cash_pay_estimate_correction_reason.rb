class AddCashPayEstimateCorrectionReason < ActiveRecord::Migration[8.0]
  def change
    add_column :clinic_cash_pay_estimates, :correction_reason, :string, limit: 500
    add_index :clinic_cash_pay_estimates, [ :practice_id, :supersedes_id ], unique: true,
      where: "supersedes_id IS NOT NULL", name: "clinic_cash_pay_estimates_one_correction"
    add_check_constraint :clinic_cash_pay_estimates,
      "(supersedes_id IS NULL AND correction_reason IS NULL) OR " \
      "(supersedes_id IS NOT NULL AND correction_reason IS NOT NULL AND length(trim(correction_reason)) > 0)",
      name: "clinic_cash_pay_estimates_correction_reason"
  end
end
