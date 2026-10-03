class AddClinicReferralReceipts < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_service_offerings, :referral_required, :boolean, default: false, null: false
    create_table :clinic_referral_receipts do |t|
      t.bigint :practice_id, :patient_id, :site_id, :service_offering_id, :recorded_by_id, null: false
      t.bigint :prior_receipt_id
      t.string :state, :request_key, null: false
      t.date :received_on, :valid_until
      t.text :details, null: false
      t.timestamps
    end
    add_index :clinic_referral_receipts, %i[practice_id patient_id site_id service_offering_id id], name: "referral_receipt_history"
    add_index :clinic_referral_receipts, %i[practice_id patient_id id], unique: true, name: "referral_receipt_patient_identity"
    add_index :clinic_referral_receipts, %i[practice_id recorded_by_id request_key], unique: true, name: "referral_receipt_request_identity"
    add_index :clinic_referral_receipts, :prior_receipt_id, unique: true, where: "prior_receipt_id IS NOT NULL"
    add_foreign_key :clinic_referral_receipts, :clinic_patients, column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "referral_receipt_patient_fk"
    add_foreign_key :clinic_referral_receipts, :clinic_sites, column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "referral_receipt_site_fk"
    add_foreign_key :clinic_referral_receipts, :clinic_service_offerings, column: %i[practice_id service_offering_id], primary_key: %i[practice_id id], name: "referral_receipt_offering_fk"
    add_foreign_key :clinic_referral_receipts, :users, column: :recorded_by_id
    add_foreign_key :clinic_referral_receipts, :clinic_referral_receipts, column: %i[practice_id patient_id prior_receipt_id], primary_key: %i[practice_id patient_id id], name: "referral_receipt_prior_fk"
    add_check_constraint :clinic_referral_receipts, "state IN ('received','withdrawn') AND (state <> 'received' OR received_on IS NOT NULL) AND (valid_until IS NULL OR (received_on IS NOT NULL AND valid_until >= received_on)) AND (state <> 'withdrawn' OR prior_receipt_id IS NOT NULL)", name: "referral_receipt_state"
    reversible do |direction|
      direction.up do
        execute "CREATE TRIGGER referral_receipt_immutable BEFORE UPDATE OR DELETE ON clinic_referral_receipts FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
        execute "CREATE TRIGGER referral_receipt_no_truncate BEFORE TRUNCATE ON clinic_referral_receipts FOR EACH STATEMENT EXECUTE FUNCTION erd_immutable_record()"
      end
      direction.down do
        execute "DROP TRIGGER referral_receipt_no_truncate ON clinic_referral_receipts"
        execute "DROP TRIGGER referral_receipt_immutable ON clinic_referral_receipts"
      end
    end
  end
end
