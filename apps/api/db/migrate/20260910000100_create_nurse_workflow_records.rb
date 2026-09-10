class CreateNurseWorkflowRecords < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_encounter_intake_revisions do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.integer :version_number, null: false
      t.string :status, null: false, limit: 32
      t.string :identity_state, null: false, limit: 32
      t.string :visit_reason_state, null: false, limit: 32
      t.string :history_state, null: false, limit: 32
      t.string :vitals_state, null: false, limit: 32
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.string :content_digest, null: false, limit: 64
      t.timestamps
    end
    add_index :clinic_encounter_intake_revisions, %i[practice_id id], unique: true,
      name: "clinic_intake_revisions_practice_id"
    add_index :clinic_encounter_intake_revisions, %i[practice_id patient_id encounter_id id], unique: true,
      name: "clinic_intake_revisions_context_id"
    add_index :clinic_encounter_intake_revisions, %i[practice_id encounter_id version_number], unique: true,
      name: "clinic_intake_revisions_version"
    add_index :clinic_encounter_intake_revisions, %i[practice_id request_key], unique: true,
      name: "clinic_intake_revisions_request"
    add_foreign_key :clinic_encounter_intake_revisions, :clinic_practices, column: :practice_id,
      name: "fk_intake_revisions_practice"
    add_foreign_key :clinic_encounter_intake_revisions, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_intake_revisions_patient"
    add_foreign_key :clinic_encounter_intake_revisions, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_intake_revisions_encounter"
    add_foreign_key :clinic_encounter_intake_revisions, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_intake_revisions_recorder"
    add_check_constraint :clinic_encounter_intake_revisions,
      "status IN ('incomplete','ready_for_handoff','unable_to_complete') AND " \
      "identity_state IN ('confirmed','not_confirmed','unable_to_confirm') AND " \
      "visit_reason_state IN ('confirmed','needs_correction','not_recorded','unable_to_obtain') AND " \
      "history_state IN ('reviewed','incomplete','not_recorded','unable_to_obtain') AND " \
      "vitals_state IN ('recorded','incomplete','not_recorded','declined','unable_to_obtain','not_applicable') AND " \
      "version_number > 0 AND length(content_digest) = 64",
      name: "clinic_intake_revisions_states"

    create_table :clinic_encounter_intake_observation_refs do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :intake_revision_id, null: false
      t.bigint :observation_id, null: false
      t.timestamps
    end
    add_index :clinic_encounter_intake_observation_refs,
      %i[practice_id intake_revision_id observation_id], unique: true, name: "clinic_intake_observation_refs_identity"
    add_foreign_key :clinic_encounter_intake_observation_refs, :clinic_practices, column: :practice_id,
      name: "fk_intake_observation_refs_practice"
    add_foreign_key :clinic_encounter_intake_observation_refs, :clinic_encounter_intake_revisions,
      column: %i[practice_id patient_id encounter_id intake_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_intake_observation_refs_revision"
    add_foreign_key :clinic_encounter_intake_observation_refs, :clinic_observations,
      column: %i[practice_id patient_id observation_id], primary_key: %i[practice_id patient_id id],
      name: "fk_intake_observation_refs_observation"

    create_table :clinic_encounter_intake_history_refs do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :intake_revision_id, null: false
      t.bigint :history_review_id, null: false
      t.timestamps
    end
    add_index :clinic_encounter_intake_history_refs,
      %i[practice_id intake_revision_id history_review_id], unique: true, name: "clinic_intake_history_refs_identity"
    add_foreign_key :clinic_encounter_intake_history_refs, :clinic_practices, column: :practice_id,
      name: "fk_intake_history_refs_practice"
    add_foreign_key :clinic_encounter_intake_history_refs, :clinic_encounter_intake_revisions,
      column: %i[practice_id patient_id encounter_id intake_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_intake_history_refs_revision"
    add_foreign_key :clinic_encounter_intake_history_refs, :clinic_patient_history_reviews,
      column: %i[practice_id history_review_id], primary_key: %i[practice_id id],
      name: "fk_intake_history_refs_review"

    create_table :clinic_encounter_handoffs do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :intake_revision_id, null: false
      t.string :state, null: false, limit: 32
      t.bigint :requested_by_membership_id, null: false
      t.bigint :accepted_by_membership_id
      t.column :requested_at, "timestamp(6) with time zone", null: false
      t.column :responded_at, "timestamp(6) with time zone"
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_encounter_handoffs, %i[practice_id id], unique: true,
      name: "clinic_handoffs_practice_id"
    add_index :clinic_encounter_handoffs, %i[practice_id patient_id encounter_id id], unique: true,
      name: "clinic_handoffs_context_id"
    add_index :clinic_encounter_handoffs, %i[practice_id encounter_id], unique: true,
      where: "state IN ('pending','accepted','correction_requested')", name: "clinic_handoffs_one_active"
    add_foreign_key :clinic_encounter_handoffs, :clinic_practices, column: :practice_id,
      name: "fk_handoffs_practice"
    add_foreign_key :clinic_encounter_handoffs, :clinic_encounter_intake_revisions,
      column: %i[practice_id patient_id encounter_id intake_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_handoffs_intake_revision"
    add_foreign_key :clinic_encounter_handoffs, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_handoffs_encounter"
    add_foreign_key :clinic_encounter_handoffs, :clinic_memberships,
      column: %i[practice_id requested_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_handoffs_requester"
    add_foreign_key :clinic_encounter_handoffs, :clinic_memberships,
      column: %i[practice_id accepted_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_handoffs_acceptor"
    add_check_constraint :clinic_encounter_handoffs,
      "state IN ('pending','accepted','rejected','correction_requested','completed','cancelled') AND " \
      "((state IN ('accepted','completed') AND accepted_by_membership_id IS NOT NULL AND responded_at IS NOT NULL) OR " \
      "(state = 'pending' AND accepted_by_membership_id IS NULL AND responded_at IS NULL) OR " \
      "(state IN ('rejected','correction_requested','cancelled') AND accepted_by_membership_id IS NULL AND responded_at IS NOT NULL))",
      name: "clinic_handoffs_state_evidence"

    create_table :clinic_encounter_handoff_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :handoff_id, null: false
      t.integer :version_number, null: false
      t.string :event_code, null: false, limit: 32
      t.bigint :actor_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.string :content_digest, null: false, limit: 64
      t.timestamps
    end
    add_index :clinic_encounter_handoff_events, %i[practice_id id], unique: true,
      name: "clinic_handoff_events_practice_id"
    add_index :clinic_encounter_handoff_events, %i[practice_id handoff_id version_number], unique: true,
      name: "clinic_handoff_events_version"
    add_index :clinic_encounter_handoff_events, %i[practice_id request_key], unique: true,
      name: "clinic_handoff_events_request"
    add_foreign_key :clinic_encounter_handoff_events, :clinic_practices, column: :practice_id,
      name: "fk_handoff_events_practice"
    add_foreign_key :clinic_encounter_handoff_events, :clinic_encounter_handoffs,
      column: %i[practice_id patient_id encounter_id handoff_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_handoff_events_handoff"
    add_foreign_key :clinic_encounter_handoff_events, :clinic_memberships,
      column: %i[practice_id actor_membership_id], primary_key: %i[practice_id id],
      name: "fk_handoff_events_actor"
    add_check_constraint :clinic_encounter_handoff_events,
      "version_number > 0 AND event_code IN ('requested','accepted','rejected','correction_requested','completed','cancelled') AND length(content_digest) = 64",
      name: "clinic_handoff_events_values"

    create_table :clinic_clinical_tasks do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id
      t.bigint :site_id
      t.string :task_kind, null: false, limit: 40
      t.string :state, null: false, limit: 24
      t.string :pool_code, null: false, limit: 40
      t.bigint :assigned_to_membership_id
      t.column :due_at, "timestamp(6) with time zone"
      t.string :source_type, null: false, limit: 60
      t.bigint :source_id
      t.string :resolution_code, limit: 40
      t.bigint :recorded_by_membership_id, null: false
      t.bigint :completed_by_membership_id
      t.column :completed_at, "timestamp(6) with time zone"
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_clinical_tasks, %i[practice_id id], unique: true, name: "clinic_tasks_practice_id"
    add_index :clinic_clinical_tasks, %i[practice_id patient_id state due_at id], name: "clinic_tasks_patient_work"
    add_index :clinic_clinical_tasks, %i[practice_id pool_code state due_at id], name: "clinic_tasks_pool_work"
    add_index :clinic_clinical_tasks, %i[practice_id source_type source_id], name: "clinic_tasks_source"
    add_foreign_key :clinic_clinical_tasks, :clinic_practices, column: :practice_id, name: "fk_tasks_practice"
    add_foreign_key :clinic_clinical_tasks, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_tasks_patient"
    add_foreign_key :clinic_clinical_tasks, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_tasks_encounter"
    add_foreign_key :clinic_clinical_tasks, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "fk_tasks_site"
    %i[assigned_to_membership_id recorded_by_membership_id completed_by_membership_id].each do |column|
      add_foreign_key :clinic_clinical_tasks, :clinic_memberships,
        column: [ :practice_id, column ], primary_key: %i[practice_id id],
        name: "fk_tasks_#{column.to_s.sub('_membership_id', '')}"
    end
    add_check_constraint :clinic_clinical_tasks,
      "task_kind IN ('intake','handoff','result_follow_up','patient_call','order_execution','record_request') AND " \
      "state IN ('open','claimed','in_progress','completed','cancelled') AND " \
      "pool_code IN ('clinical','front_desk','records') AND " \
      "source_type IN ('manual','encounter','handoff','lab_follow_up','message','reminder','order') AND " \
      "((state = 'completed' AND resolution_code IS NOT NULL AND completed_by_membership_id IS NOT NULL AND completed_at IS NOT NULL) OR " \
      "(state <> 'completed' AND resolution_code IS NULL AND completed_by_membership_id IS NULL AND completed_at IS NULL))",
      name: "clinic_tasks_state_evidence"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_intake_revisions_immutable BEFORE UPDATE OR DELETE ON clinic_encounter_intake_revisions
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
          CREATE TRIGGER clinic_intake_observation_refs_immutable BEFORE UPDATE OR DELETE ON clinic_encounter_intake_observation_refs
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
          CREATE TRIGGER clinic_intake_history_refs_immutable BEFORE UPDATE OR DELETE ON clinic_encounter_intake_history_refs
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
          CREATE TRIGGER clinic_handoff_events_immutable BEFORE UPDATE OR DELETE ON clinic_encounter_handoff_events
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_handoff_events_immutable ON clinic_encounter_handoff_events"
        execute "DROP TRIGGER IF EXISTS clinic_intake_history_refs_immutable ON clinic_encounter_intake_history_refs"
        execute "DROP TRIGGER IF EXISTS clinic_intake_observation_refs_immutable ON clinic_encounter_intake_observation_refs"
        execute "DROP TRIGGER IF EXISTS clinic_intake_revisions_immutable ON clinic_encounter_intake_revisions"
      end
    end
  end
end
