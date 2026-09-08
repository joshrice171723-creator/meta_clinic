class CreatePrevisitNotes < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_previsit_notes do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :appointment_id, null: false
      t.integer :version_number, null: false
      t.text :encrypted_text, null: false
      t.bigint :submitted_by_user_id, null: false
      t.string :request_key, null: false, limit: 160
      t.column :submitted_at, "timestamp(6) with time zone", null: false
      t.timestamps
    end

    add_index :clinic_previsit_notes, [ :practice_id, :id ], unique: true,
      name: "clinic_previsit_notes_practice_id"
    add_index :clinic_previsit_notes,
      [ :practice_id, :patient_id, :appointment_id, :version_number ], unique: true,
      name: "clinic_previsit_notes_appointment_version"
    add_index :clinic_previsit_notes,
      [ :practice_id, :submitted_by_user_id, :request_key ], unique: true,
      name: "clinic_previsit_notes_request_key"

    add_foreign_key :clinic_previsit_notes, :clinic_practices,
      column: :practice_id, name: "fk_previsit_notes_practice"
    add_foreign_key :clinic_previsit_notes, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_previsit_notes_patient"
    add_foreign_key :clinic_previsit_notes, :clinic_appointments,
      column: [ :practice_id, :patient_id, :appointment_id ],
      primary_key: [ :practice_id, :patient_id, :id ], name: "fk_previsit_notes_appointment"
    add_foreign_key :clinic_previsit_notes, :users,
      column: :submitted_by_user_id, name: "fk_previsit_notes_submitter"

    add_check_constraint :clinic_previsit_notes,
      "version_number > 0 AND length(request_key) BETWEEN 1 AND 160",
      name: "clinic_previsit_notes_values"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION clinic_previsit_notes_protect() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'Pre-visit note history is immutable';
          END;
          $$;
          CREATE TRIGGER clinic_previsit_notes_protect
          BEFORE UPDATE OR DELETE ON clinic_previsit_notes
          FOR EACH ROW EXECUTE FUNCTION clinic_previsit_notes_protect();
        SQL
      end

      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_previsit_notes_protect ON clinic_previsit_notes"
        execute "DROP FUNCTION IF EXISTS clinic_previsit_notes_protect()"
      end
    end
  end
end
