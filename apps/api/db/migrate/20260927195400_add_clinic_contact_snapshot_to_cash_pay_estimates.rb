class AddClinicContactSnapshotToCashPayEstimates < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_cash_pay_estimates, :clinic_contact_snapshot, :jsonb, null: false, default: {}
    add_check_constraint :clinic_cash_pay_estimates,
      "jsonb_typeof(clinic_contact_snapshot) = 'object'",
      name: "clinic_cash_pay_estimates_contact_snapshot_object"
  end
end
