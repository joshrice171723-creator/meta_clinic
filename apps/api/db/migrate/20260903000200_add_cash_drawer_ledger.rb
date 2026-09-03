class AddCashDrawerLedger < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_cash_drawer_sessions do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :site, null: false, foreign_key: { to_table: :clinic_sites }
      t.references :opened_by, null: false, foreign_key: { to_table: :users }
      t.references :closed_by, foreign_key: { to_table: :users }
      t.string :status, null: false, default: "open"
      t.decimal :opening_float, precision: 20, scale: 6, null: false
      t.decimal :counted_cash, precision: 20, scale: 6
      t.decimal :discrepancy, precision: 20, scale: 6
      t.text :discrepancy_explanation
      t.datetime :closed_at
      t.timestamps
    end
    add_index :clinic_cash_drawer_sessions, %i[practice_id id], unique: true
    add_index :clinic_cash_drawer_sessions, %i[practice_id site_id], unique: true, where: "status = 'open'", name: "clinic_cash_drawer_one_open_per_site"

    create_table :clinic_cash_tenders do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :patient, null: false
      t.references :payment_event, null: false
      t.references :cash_drawer_session, null: false
      t.decimal :tendered_amount, precision: 20, scale: 6, null: false
      t.decimal :change_amount, precision: 20, scale: 6, null: false, default: 0
      t.references :recorded_by, null: false, foreign_key: { to_table: :users }
      t.timestamps
    end
    add_foreign_key :clinic_cash_tenders, :clinic_patients, column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_cash_tenders_patient"
    add_foreign_key :clinic_cash_tenders, :clinic_payment_events, column: %i[practice_id patient_id payment_event_id], primary_key: %i[practice_id patient_id id], name: "fk_cash_tenders_payment"
    add_foreign_key :clinic_cash_tenders, :clinic_cash_drawer_sessions, column: %i[practice_id cash_drawer_session_id], primary_key: %i[practice_id id], name: "fk_cash_tenders_drawer"
    add_index :clinic_cash_tenders, %i[practice_id payment_event_id], unique: true
    add_check_constraint :clinic_cash_drawer_sessions, "status IN ('open', 'closed')", name: "cash_drawer_session_status"
    add_check_constraint :clinic_cash_tenders, "tendered_amount > 0 AND change_amount >= 0 AND change_amount < tendered_amount", name: "cash_tender_amounts"
  end
end
