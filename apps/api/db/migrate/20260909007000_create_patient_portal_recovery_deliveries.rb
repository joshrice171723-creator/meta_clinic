class CreatePatientPortalRecoveryDeliveries < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_patient_portal_recovery_deliveries do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :identity, null: false
      t.references :patient_contact, null: false
      t.text :token
      t.string :status, null: false, default: "pending"
      t.string :provider, null: false, default: "twilio"
      t.datetime :requested_at, null: false
      t.datetime :available_at, null: false
      t.datetime :expires_at, null: false
      t.datetime :lease_until
      t.string :lease_token_digest
      t.integer :attempt_count, null: false, default: 0
      t.string :provider_message_id
      t.string :failure_code
      t.datetime :accepted_at
      t.datetime :completed_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end

    add_index :clinic_patient_portal_recovery_deliveries, [ :practice_id, :id ], unique: true,
      name: "clinic_portal_recovery_deliveries_practice_id"
    add_index :clinic_patient_portal_recovery_deliveries, [ :status, :available_at, :id ],
      name: "clinic_portal_recovery_deliveries_queue"
    add_index :clinic_patient_portal_recovery_deliveries, [ :provider, :provider_message_id ], unique: true,
      where: "provider_message_id IS NOT NULL", name: "clinic_portal_recovery_deliveries_provider_message"
    add_foreign_key :clinic_patient_portal_recovery_deliveries, :clinic_patient_portal_identities,
      column: [ :practice_id, :identity_id ], primary_key: [ :practice_id, :id ],
      name: "fk_portal_recovery_deliveries_identity"
    add_foreign_key :clinic_patient_portal_recovery_deliveries, :clinic_patient_contacts,
      column: [ :practice_id, :patient_contact_id ], primary_key: [ :practice_id, :id ],
      name: "fk_portal_recovery_deliveries_contact"
    add_check_constraint :clinic_patient_portal_recovery_deliveries, <<~SQL.squish, name: "clinic_portal_recovery_deliveries_values"
      status IN ('pending','leased','accepted','failed','unknown','gated','expired','cancelled') AND
      provider = 'twilio' AND attempt_count BETWEEN 0 AND 1 AND expires_at > requested_at AND
      ((status IN ('pending','leased')) = (token IS NOT NULL)) AND
      ((status = 'leased') = (lease_until IS NOT NULL AND lease_token_digest IS NOT NULL)) AND
      (lease_token_digest IS NULL OR length(lease_token_digest) = 64) AND
      (provider_message_id IS NULL OR provider_message_id ~ '^SM[0-9A-Fa-f]{32}$')
    SQL
  end
end
