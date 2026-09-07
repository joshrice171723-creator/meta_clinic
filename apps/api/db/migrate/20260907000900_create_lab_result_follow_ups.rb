class CreateLabResultFollowUps < ActiveRecord::Migration[8.0]
  def change
    create_table :clinic_lab_result_follow_ups do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :lab_report_id, null: false
      t.bigint :lab_report_version_id, null: false
      t.string :state, null: false
      t.text :instructions
      t.text :outcome
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.bigint :completed_by_membership_id
      t.column :completed_at, "timestamp(6) with time zone"
      t.column :superseded_at, "timestamp(6) with time zone"
      t.timestamps
    end

    add_index :clinic_lab_result_follow_ups, [ :practice_id, :id ], unique: true,
      name: "clinic_lab_follow_ups_practice_id"
    add_index :clinic_lab_result_follow_ups,
      [ :practice_id, :patient_id, :lab_report_id, :lab_report_version_id ], unique: true,
      name: "clinic_lab_follow_ups_version_id"
    add_index :clinic_lab_result_follow_ups, [ :practice_id, :state, :recorded_at, :id ],
      where: "state = 'open'", name: "clinic_lab_follow_ups_open_queue"

    add_foreign_key :clinic_lab_result_follow_ups, :clinic_practices,
      column: :practice_id, name: "fk_lab_follow_ups_practice"
    add_foreign_key :clinic_lab_result_follow_ups, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_lab_follow_ups_patient"
    add_foreign_key :clinic_lab_result_follow_ups, :clinic_lab_reports,
      column: [ :practice_id, :patient_id, :lab_report_id ], primary_key: [ :practice_id, :patient_id, :id ],
      name: "fk_lab_follow_ups_report"
    add_foreign_key :clinic_lab_result_follow_ups, :clinic_lab_report_versions,
      column: [ :practice_id, :patient_id, :lab_report_id, :lab_report_version_id ],
      primary_key: [ :practice_id, :patient_id, :lab_report_id, :id ], name: "fk_lab_follow_ups_version"
    add_foreign_key :clinic_lab_result_follow_ups, :clinic_memberships,
      column: [ :practice_id, :recorded_by_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_lab_follow_ups_recorder"
    add_foreign_key :clinic_lab_result_follow_ups, :clinic_memberships,
      column: [ :practice_id, :completed_by_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_lab_follow_ups_completer"

    add_check_constraint :clinic_lab_result_follow_ups,
      "state IN ('open','completed','not_required','superseded') AND " \
      "(instructions IS NULL OR char_length(trim(instructions)) BETWEEN 1 AND 1000) AND " \
      "(outcome IS NULL OR char_length(trim(outcome)) BETWEEN 1 AND 1000)",
      name: "clinic_lab_follow_ups_values"
    add_check_constraint :clinic_lab_result_follow_ups, <<~SQL.squish,
      (
        state = 'open' AND instructions IS NOT NULL AND outcome IS NULL
          AND completed_at IS NULL AND completed_by_membership_id IS NULL AND superseded_at IS NULL
      ) OR (
        state = 'completed' AND instructions IS NOT NULL AND outcome IS NOT NULL
          AND completed_at IS NOT NULL AND completed_by_membership_id IS NOT NULL AND superseded_at IS NULL
      ) OR (
        state = 'not_required' AND outcome IS NULL
          AND completed_at IS NULL AND completed_by_membership_id IS NULL AND superseded_at IS NULL
      ) OR (
        state = 'superseded' AND instructions IS NOT NULL AND outcome IS NULL
          AND completed_at IS NULL AND completed_by_membership_id IS NULL AND superseded_at IS NOT NULL
      )
    SQL
      name: "clinic_lab_follow_ups_state_evidence"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION clinic_lab_result_follow_ups_protect() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF TG_OP = 'DELETE' THEN
              RAISE EXCEPTION 'Lab result follow-ups cannot be deleted';
            END IF;

            IF OLD.id IS DISTINCT FROM NEW.id
              OR OLD.practice_id IS DISTINCT FROM NEW.practice_id
              OR OLD.patient_id IS DISTINCT FROM NEW.patient_id
              OR OLD.lab_report_id IS DISTINCT FROM NEW.lab_report_id
              OR OLD.lab_report_version_id IS DISTINCT FROM NEW.lab_report_version_id
              OR OLD.instructions IS DISTINCT FROM NEW.instructions
              OR OLD.recorded_by_membership_id IS DISTINCT FROM NEW.recorded_by_membership_id
              OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at
              OR OLD.created_at IS DISTINCT FROM NEW.created_at
              OR OLD.state <> 'open'
              OR NEW.state NOT IN ('completed', 'superseded') THEN
              RAISE EXCEPTION 'Lab result follow-up evidence is immutable';
            END IF;

            IF NEW.state = 'completed' AND (
              NEW.outcome IS NULL
              OR NEW.completed_at IS NULL
              OR NEW.completed_by_membership_id IS NULL
              OR NEW.superseded_at IS NOT NULL
            ) THEN
              RAISE EXCEPTION 'Completed lab result follow-up evidence is incomplete';
            END IF;

            IF NEW.state = 'superseded' AND (
              NEW.outcome IS NOT NULL
              OR NEW.completed_at IS NOT NULL
              OR NEW.completed_by_membership_id IS NOT NULL
              OR NEW.superseded_at IS NULL
            ) THEN
              RAISE EXCEPTION 'Superseded lab result follow-up evidence is incomplete';
            END IF;

            RETURN NEW;
          END;
          $$;
          CREATE TRIGGER clinic_lab_result_follow_ups_protect
          BEFORE UPDATE OR DELETE ON clinic_lab_result_follow_ups
          FOR EACH ROW EXECUTE FUNCTION clinic_lab_result_follow_ups_protect();
        SQL
      end

      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_lab_result_follow_ups_protect ON clinic_lab_result_follow_ups"
        execute "DROP FUNCTION IF EXISTS clinic_lab_result_follow_ups_protect()"
      end
    end
  end
end
