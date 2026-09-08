class CreateClinicPatientPortalIdentities < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_patient_portal_identities do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :user_id, null: false
      t.string :status, null: false, default: "active"
      t.datetime :invited_at, null: false
      t.datetime :activated_at
      t.datetime :revoked_at
      t.timestamps
    end

    add_index :clinic_patient_portal_identities, [ :practice_id, :id ], unique: true,
      name: "clinic_patient_portal_identities_practice_id"
    add_index :clinic_patient_portal_identities, [ :practice_id, :patient_id ], unique: true,
      name: "clinic_patient_portal_identities_patient"
    add_index :clinic_patient_portal_identities, :user_id, unique: true,
      name: "clinic_patient_portal_identities_user"
    add_check_constraint :clinic_patient_portal_identities,
      "status IN ('invited', 'active', 'revoked')", name: "clinic_patient_portal_identity_status"
    add_foreign_key :clinic_patient_portal_identities, :clinic_practices, column: :practice_id,
      name: "fk_patient_portal_identities_practice"
    add_foreign_key :clinic_patient_portal_identities, :users, column: :user_id,
      name: "fk_patient_portal_identities_user"
    add_foreign_key :clinic_patient_portal_identities, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_portal_identities_patient"
  end
end
