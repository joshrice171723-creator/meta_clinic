class AddCashDrawerReconciliation < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_cash_drawer_sessions, :reconciliation_status, :string, null: false, default: "pending"
    add_column :clinic_cash_drawer_sessions, :reconciled_by_id, :bigint
    add_column :clinic_cash_drawer_sessions, :reconciled_at, :datetime
    add_column :clinic_cash_drawer_sessions, :reconciliation_note, :text
    add_column :clinic_cash_drawer_sessions, :reconciliation_request_key, :string
    add_foreign_key :clinic_cash_drawer_sessions, :users, column: :reconciled_by_id
    add_index :clinic_cash_drawer_sessions, %i[practice_id reconciliation_request_key], unique: true,
      name: "cash_drawer_reconciliation_request", where: "reconciliation_request_key IS NOT NULL"
    add_check_constraint :clinic_cash_drawer_sessions,
      "reconciliation_status IN ('pending', 'reconciled') AND ((reconciliation_status = 'pending' AND reconciled_by_id IS NULL AND reconciled_at IS NULL AND reconciliation_request_key IS NULL) OR (reconciliation_status = 'reconciled' AND reconciled_by_id IS NOT NULL AND reconciled_at IS NOT NULL AND reconciliation_request_key IS NOT NULL))",
      name: "cash_drawer_reconciliation_state"
  end
end
