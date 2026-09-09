class CreateClinicEncounterFollowUps < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_encounter_follow_ups do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :follow_up_appointment_id
      t.bigint :assigned_to_membership_id
      t.bigint :recorded_by_membership_id, null: false
      t.bigint :updated_by_membership_id, null: false
      t.bigint :completed_by_membership_id
      t.string :source_kind, null: false
      t.string :state, null: false
      t.text :plan, null: false
      t.text :outcome, null: false
      t.datetime :due_at
      t.datetime :completed_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end

    add_index :clinic_encounter_follow_ups, [ :practice_id, :encounter_id ], unique: true,
      name: "idx_encounter_follow_ups_canonical"
    add_index :clinic_encounter_follow_ups, [ :practice_id, :state, :due_at, :id ],
      name: "idx_encounter_follow_ups_worklist"
    add_foreign_key :clinic_encounter_follow_ups, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_encounter_follow_ups_patient"
    add_foreign_key :clinic_encounter_follow_ups, :clinic_encounters,
      column: [ :practice_id, :patient_id, :encounter_id ], primary_key: [ :practice_id, :patient_id, :id ],
      name: "fk_encounter_follow_ups_encounter"
    add_foreign_key :clinic_encounter_follow_ups, :clinic_appointments,
      column: [ :practice_id, :patient_id, :follow_up_appointment_id ], primary_key: [ :practice_id, :patient_id, :id ],
      name: "fk_encounter_follow_ups_appointment"
    %i[assigned_to_membership_id recorded_by_membership_id updated_by_membership_id completed_by_membership_id].each do |column|
      add_foreign_key :clinic_encounter_follow_ups, :clinic_memberships,
        column: [ :practice_id, column ], primary_key: [ :practice_id, :id ],
        name: "fk_encounter_follow_ups_#{column.to_s.delete_suffix('_membership_id')}"
    end
    add_check_constraint :clinic_encounter_follow_ups,
      "source_kind IN ('in_person', 'telehealth')", name: "encounter_follow_ups_source_kind"
    add_check_constraint :clinic_encounter_follow_ups,
      "state IN ('not_required', 'needed', 'arranged', 'completed')", name: "encounter_follow_ups_state"
    add_check_constraint :clinic_encounter_follow_ups,
      "state <> 'arranged' OR follow_up_appointment_id IS NOT NULL", name: "encounter_follow_ups_arranged_appointment"
    add_check_constraint :clinic_encounter_follow_ups,
      "state <> 'completed' OR (completed_at IS NOT NULL AND completed_by_membership_id IS NOT NULL AND outcome <> '')",
      name: "encounter_follow_ups_completion_evidence"
  end
end
