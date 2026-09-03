class AddBillingReceipts < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_billing_receipts do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :patient, null: false
      t.references :invoice, null: false
      t.references :payment_event, null: false
      t.references :issued_by, null: false, foreign_key: { to_table: :users }
      t.string :kind, null: false
      t.jsonb :payload, null: false, default: {}
      t.datetime :issued_at, null: false
      t.timestamps
    end
    add_foreign_key :clinic_billing_receipts, :clinic_patients, column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_billing_receipts_patient"
    add_foreign_key :clinic_billing_receipts, :clinic_invoices, column: %i[practice_id patient_id invoice_id], primary_key: %i[practice_id patient_id id], name: "fk_billing_receipts_invoice"
    add_foreign_key :clinic_billing_receipts, :clinic_payment_events, column: %i[practice_id patient_id payment_event_id], primary_key: %i[practice_id patient_id id], name: "fk_billing_receipts_payment"
    add_check_constraint :clinic_billing_receipts, "kind IN ('cash_payment', 'cash_refund')", name: "billing_receipt_kind"
  end
end
