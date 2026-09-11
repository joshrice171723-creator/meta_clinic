class CreateEncounterCompletionReviews < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_encounter_completion_reviews do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :follow_up_id, null: false
      t.integer :follow_up_version, null: false
      t.string :follow_up_state, null: false
      t.bigint :instruction_note_id
      t.bigint :instruction_note_revision_id
      t.string :disposition_code, null: false
      t.string :instructions_status, null: false
      t.string :education_status, null: false
      t.bigint :education_event_ids, array: true, null: false, default: []
      t.jsonb :open_work_snapshot, null: false, default: []
      t.text :exception_note
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false
      t.timestamps
    end

    add_index :clinic_encounter_completion_reviews, %i[practice_id id], unique: true,
      name: "clinic_completion_reviews_practice_id"
    add_index :clinic_encounter_completion_reviews, %i[practice_id encounter_id], unique: true,
      name: "clinic_completion_reviews_encounter"
    add_index :clinic_encounter_completion_reviews, %i[practice_id recorded_by_membership_id request_key], unique: true,
      name: "clinic_completion_reviews_request"
    add_index :clinic_encounter_completion_reviews, :education_event_ids, using: :gin,
      name: "clinic_completion_reviews_education"
    add_index :clinic_encounter_follow_ups, %i[practice_id id], unique: true,
      name: "clinic_encounter_follow_ups_practice_id"

    add_foreign_key :clinic_encounter_completion_reviews, :clinic_practices,
      column: :practice_id, name: "fk_completion_reviews_practice"
    add_foreign_key :clinic_encounter_completion_reviews, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id],
      name: "fk_completion_reviews_patient"
    add_foreign_key :clinic_encounter_completion_reviews, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_completion_reviews_encounter"
    add_foreign_key :clinic_encounter_completion_reviews, :clinic_encounter_follow_ups,
      column: %i[practice_id follow_up_id], primary_key: %i[practice_id id],
      name: "fk_completion_reviews_follow_up"
    add_foreign_key :clinic_encounter_completion_reviews, :clinic_encounter_notes,
      column: %i[practice_id instruction_note_id], primary_key: %i[practice_id id],
      name: "fk_completion_reviews_instruction_note"
    add_foreign_key :clinic_encounter_completion_reviews, :clinic_encounter_note_revisions,
      column: %i[practice_id instruction_note_id instruction_note_revision_id],
      primary_key: %i[practice_id note_id id], name: "fk_completion_reviews_instruction_revision"
    add_foreign_key :clinic_encounter_completion_reviews, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_completion_reviews_recorder"

    add_check_constraint :clinic_encounter_completion_reviews, <<~SQL.squish,
      disposition_code IN (
        'completed_as_planned', 'left_before_completion', 'transferred_to_higher_level_of_care',
        'emergency_services', 'other'
      )
      AND instructions_status IN ('provided', 'not_required', 'unable_to_complete')
      AND education_status IN ('recorded', 'not_required', 'unable_to_complete')
      AND follow_up_state IN ('not_required', 'needed', 'arranged', 'completed')
      AND follow_up_version >= 0
      AND jsonb_typeof(open_work_snapshot) = 'array'
      AND (
        (instructions_status = 'provided' AND instruction_note_id IS NOT NULL AND instruction_note_revision_id IS NOT NULL)
        OR (instructions_status <> 'provided' AND instruction_note_id IS NULL AND instruction_note_revision_id IS NULL)
      )
      AND (
        (education_status = 'recorded' AND cardinality(education_event_ids) > 0)
        OR (education_status <> 'recorded' AND cardinality(education_event_ids) = 0)
      )
      AND (
        (disposition_code = 'completed_as_planned' AND instructions_status <> 'unable_to_complete'
          AND education_status <> 'unable_to_complete')
        OR exception_note IS NOT NULL
      )
    SQL
      name: "clinic_completion_reviews_evidence"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION clinic_encounter_completion_reviews_immutable() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'Encounter completion reviews are append-only';
          END;
          $$;
          CREATE TRIGGER clinic_encounter_completion_reviews_immutable
          BEFORE UPDATE OR DELETE ON clinic_encounter_completion_reviews
          FOR EACH ROW EXECUTE FUNCTION clinic_encounter_completion_reviews_immutable();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_encounter_completion_reviews_immutable ON clinic_encounter_completion_reviews"
        execute "DROP FUNCTION IF EXISTS clinic_encounter_completion_reviews_immutable()"
      end
    end
  end
end
