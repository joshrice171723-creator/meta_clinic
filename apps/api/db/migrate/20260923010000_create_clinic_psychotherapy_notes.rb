class CreateClinicPsychotherapyNotes < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_psychotherapy_notes do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :originator_membership_id, null: false
      t.bigint :previous_revision_id
      t.integer :version_number, null: false
      t.string :request_key, null: false, limit: 160
      t.text :body, null: false
      t.text :revision_reason
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.timestamps
    end

    add_index :clinic_psychotherapy_notes, %i[practice_id id], unique: true,
      name: "psychotherapy_notes_practice_id"
    add_index :clinic_psychotherapy_notes, %i[practice_id encounter_id originator_membership_id id], unique: true,
      name: "psychotherapy_notes_originator_revision_id"
    add_index :clinic_psychotherapy_notes, %i[practice_id encounter_id originator_membership_id version_number], unique: true,
      name: "psychotherapy_notes_version"
    add_index :clinic_psychotherapy_notes, %i[practice_id originator_membership_id request_key], unique: true,
      name: "psychotherapy_notes_exact_request"
    add_foreign_key :clinic_psychotherapy_notes, :clinic_practices, column: :practice_id,
      name: "psychotherapy_notes_practice"
    add_foreign_key :clinic_psychotherapy_notes, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "psychotherapy_notes_encounter"
    add_foreign_key :clinic_psychotherapy_notes, :clinic_memberships,
      column: %i[practice_id originator_membership_id], primary_key: %i[practice_id id],
      name: "psychotherapy_notes_originator"
    add_foreign_key :clinic_psychotherapy_notes, :clinic_psychotherapy_notes,
      column: %i[practice_id encounter_id originator_membership_id previous_revision_id],
      primary_key: %i[practice_id encounter_id originator_membership_id id],
      name: "psychotherapy_notes_predecessor"
    add_check_constraint :clinic_psychotherapy_notes,
      "version_number > 0 AND length(trim(request_key)) BETWEEN 1 AND 160 AND length(trim(body)) > 0 AND " \
      "((version_number = 1 AND previous_revision_id IS NULL AND revision_reason IS NULL) OR " \
      "(version_number > 1 AND previous_revision_id IS NOT NULL AND length(trim(revision_reason)) > 0))",
      name: "psychotherapy_notes_revision_contract"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_psychotherapy_notes_immutable
          BEFORE UPDATE OR DELETE ON clinic_psychotherapy_notes
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_psychotherapy_notes_immutable ON clinic_psychotherapy_notes"
      end
    end
  end
end
