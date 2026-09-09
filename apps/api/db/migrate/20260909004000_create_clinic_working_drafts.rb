class CreateClinicWorkingDrafts < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_working_drafts do |t|
      t.bigint :practice_id, null: false
      t.bigint :actor_membership_id, null: false
      t.bigint :patient_id
      t.bigint :encounter_id
      t.string :kind, null: false, limit: 32
      t.string :context_key, null: false, limit: 160
      t.integer :version, null: false, default: 0
      t.text :encrypted_payload
      t.timestamps
    end
    add_index :clinic_working_drafts, [ :practice_id, :actor_membership_id, :context_key ],
      unique: true, name: "clinic_working_drafts_identity"
    add_foreign_key :clinic_working_drafts, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_working_drafts, :clinic_memberships,
      column: [ :practice_id, :actor_membership_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_working_drafts, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_working_drafts, :clinic_encounters,
      column: [ :practice_id, :patient_id, :encounter_id ], primary_key: [ :practice_id, :patient_id, :id ]
    add_check_constraint :clinic_working_drafts, "version >= 0 AND (encounter_id IS NULL OR patient_id IS NOT NULL)",
      name: "clinic_working_drafts_context"
  end
end
