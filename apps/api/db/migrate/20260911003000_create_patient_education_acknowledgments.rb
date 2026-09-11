class CreatePatientEducationAcknowledgments < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_patient_education_events, %i[practice_id patient_id id], unique: true,
      name: "patient_education_patient_id"
    add_index :clinic_patient_portal_identities, %i[practice_id patient_id id], unique: true,
      name: "patient_portal_identities_patient_id"

    create_table :clinic_patient_education_acknowledgments do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :education_event_id, null: false
      t.bigint :identity_id, null: false
      t.bigint :user_id, null: false
      t.string :request_key, null: false, limit: 160
      t.string :source, null: false, limit: 32, default: "patient_portal"
      t.column :acknowledged_at, "timestamp(6) with time zone", null: false
      t.timestamps
    end

    add_index :clinic_patient_education_acknowledgments, %i[practice_id id], unique: true,
      name: "patient_education_acks_practice_id"
    add_index :clinic_patient_education_acknowledgments, %i[practice_id user_id education_event_id], unique: true,
      name: "patient_education_acks_user_event"
    add_index :clinic_patient_education_acknowledgments, %i[practice_id user_id request_key], unique: true,
      name: "patient_education_acks_request_key"
    add_index :clinic_patient_education_acknowledgments, %i[practice_id patient_id acknowledged_at id],
      name: "patient_education_acks_patient_timeline"
    add_foreign_key :clinic_patient_education_acknowledgments, :clinic_practices,
      column: :practice_id, name: "fk_patient_education_acks_practice"
    add_foreign_key :clinic_patient_education_acknowledgments, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id],
      name: "fk_patient_education_acks_patient"
    add_foreign_key :clinic_patient_education_acknowledgments, :clinic_patient_education_events,
      column: %i[practice_id patient_id education_event_id], primary_key: %i[practice_id patient_id id],
      name: "fk_patient_education_acks_event"
    add_foreign_key :clinic_patient_education_acknowledgments, :clinic_patient_portal_identities,
      column: %i[practice_id patient_id identity_id], primary_key: %i[practice_id patient_id id],
      name: "fk_patient_education_acks_identity"
    add_foreign_key :clinic_patient_education_acknowledgments, :users,
      column: :user_id, name: "fk_patient_education_acks_user"
    add_check_constraint :clinic_patient_education_acknowledgments,
      "source = 'patient_portal' AND length(trim(request_key)) BETWEEN 1 AND 160",
      name: "patient_education_acks_values"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_patient_education_acknowledgments_immutable
          BEFORE UPDATE OR DELETE ON clinic_patient_education_acknowledgments
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_patient_education_acknowledgments_immutable ON clinic_patient_education_acknowledgments"
      end
    end
  end
end
