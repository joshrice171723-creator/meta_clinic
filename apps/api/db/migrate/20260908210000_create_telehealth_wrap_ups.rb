class CreateTelehealthWrapUps < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_telehealth_wrap_ups do |t|
      t.bigint :practice_id, null: false
      t.bigint :visit_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :appointment_id, null: false
      t.bigint :encounter_id, null: false
      t.string :status, null: false, default: "draft", limit: 16
      t.string :outcome, limit: 32
      t.text :clinician_notes, null: false, default: ""
      t.text :patient_instructions, null: false, default: ""
      t.bigint :instruction_note_id
      t.bigint :instruction_note_revision_id
      t.bigint :instruction_note_signature_id
      t.string :follow_up_status, limit: 16
      t.text :follow_up_plan, null: false, default: ""
      t.bigint :follow_up_appointment_id
      t.string :scribe_review_status, limit: 24
      t.bigint :scribe_encounter_id
      t.string :scribe_encounter_status, limit: 24
      t.bigint :scribe_draft_id
      t.string :scribe_draft_status, limit: 24
      t.bigint :scribe_export_id
      t.string :scribe_export_state, limit: 24
      t.bigint :scribe_encounter_note_id
      t.bigint :scribe_encounter_note_revision_id
      t.bigint :created_by_membership_id, null: false
      t.bigint :updated_by_membership_id, null: false
      t.bigint :finalized_by_membership_id
      t.datetime :finalized_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end

    add_index :clinic_telehealth_wrap_ups, [ :practice_id, :id ], unique: true,
      name: "idx_telehealth_wrap_ups_tenant_identity"
    add_index :clinic_telehealth_wrap_ups, [ :practice_id, :visit_id ], unique: true,
      name: "idx_telehealth_wrap_ups_visit"
    add_index :clinic_scribe_exports, [ :practice_id, :id ], unique: true,
      name: "idx_scribe_exports_tenant_identity"

    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_telehealth_visits,
      column: [ :practice_id, :visit_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_appointments,
      column: [ :practice_id, :patient_id, :appointment_id ], primary_key: [ :practice_id, :patient_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_encounters,
      column: [ :practice_id, :patient_id, :encounter_id ], primary_key: [ :practice_id, :patient_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_appointments,
      column: [ :practice_id, :patient_id, :follow_up_appointment_id ], primary_key: [ :practice_id, :patient_id, :id ],
      name: "fk_telehealth_wrap_ups_follow_up_appointment"
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_encounter_notes,
      column: [ :practice_id, :instruction_note_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_encounter_note_revisions,
      column: [ :practice_id, :instruction_note_revision_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_encounter_note_signatures,
      column: [ :practice_id, :instruction_note_signature_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_scribe_encounters,
      column: [ :practice_id, :scribe_encounter_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_scribe_drafts,
      column: [ :practice_id, :scribe_draft_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_scribe_exports,
      column: [ :practice_id, :scribe_export_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_encounter_notes,
      column: [ :practice_id, :scribe_encounter_note_id ], primary_key: [ :practice_id, :id ],
      name: "fk_telehealth_wrap_ups_scribe_note"
    add_foreign_key :clinic_telehealth_wrap_ups, :clinic_encounter_note_revisions,
      column: [ :practice_id, :scribe_encounter_note_revision_id ], primary_key: [ :practice_id, :id ],
      name: "fk_telehealth_wrap_ups_scribe_revision"
    %i[created_by_membership_id updated_by_membership_id finalized_by_membership_id].each do |column|
      add_foreign_key :clinic_telehealth_wrap_ups, :clinic_memberships,
        column: [ :practice_id, column ], primary_key: [ :practice_id, :id ]
    end

    add_check_constraint :clinic_telehealth_wrap_ups, <<~SQL.squish, name: "telehealth_wrap_ups_values"
      status IN ('draft','finalized') AND
      (outcome IS NULL OR outcome IN ('completed','technical_failure','follow_up_needed')) AND
      (follow_up_status IS NULL OR follow_up_status IN ('none','needed','arranged')) AND
      (scribe_review_status IS NULL OR scribe_review_status IN ('not_used','reviewed','deferred')) AND
      ((follow_up_status = 'arranged' AND follow_up_appointment_id IS NOT NULL) OR
       (follow_up_status IS DISTINCT FROM 'arranged' AND follow_up_appointment_id IS NULL)) AND
      ((status = 'draft' AND finalized_at IS NULL AND finalized_by_membership_id IS NULL) OR
       (status = 'finalized' AND outcome IS NOT NULL AND follow_up_status IS NOT NULL AND
        scribe_review_status IS NOT NULL AND instruction_note_id IS NOT NULL AND
        instruction_note_revision_id IS NOT NULL AND instruction_note_signature_id IS NOT NULL AND
        finalized_at IS NOT NULL AND finalized_by_membership_id IS NOT NULL))
    SQL

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION clinic_telehealth_wrap_ups_protect_finalized() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF OLD.status = 'finalized' THEN
              RAISE EXCEPTION 'Finalized telehealth wrap-ups are immutable';
            END IF;
            RETURN NEW;
          END;
          $$;

          CREATE TRIGGER clinic_telehealth_wrap_ups_protect_finalized
          BEFORE UPDATE OR DELETE ON clinic_telehealth_wrap_ups
          FOR EACH ROW EXECUTE FUNCTION clinic_telehealth_wrap_ups_protect_finalized();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_telehealth_wrap_ups_protect_finalized ON clinic_telehealth_wrap_ups"
        execute "DROP FUNCTION IF EXISTS clinic_telehealth_wrap_ups_protect_finalized()"
      end
    end
  end
end
