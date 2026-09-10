class CreateEncounterWorkflowRecords < ActiveRecord::Migration[8.1]
  WORKFLOW_STATES = %w[
    unrecorded awaiting_intake intake_in_progress triage_in_progress
    handoff_pending clinician_accepted
  ].freeze

  def up
    add_column :clinic_encounters, :workflow_stage, :string, null: false, default: "unrecorded"
    add_column :clinic_encounters, :workflow_version, :integer, null: false, default: 0
    add_check_constraint :clinic_encounters,
      "workflow_stage IN (#{quoted(WORKFLOW_STATES)})", name: "clinic_encounters_workflow_stage"
    add_check_constraint :clinic_encounters, "workflow_version >= 0", name: "clinic_encounters_workflow_version"

    create_workflow_events
    create_intake_records
    create_triage_evidence
    create_handoff_records
    create_clinical_tasks

    %i[
      clinic_encounter_workflow_events clinic_encounter_intake_revisions clinic_encounter_intake_items
      clinic_encounter_triage_evidence clinic_encounter_handoff_events
    ].each do |table|
      execute "CREATE TRIGGER #{table}_immutable BEFORE UPDATE OR DELETE ON #{table} " \
        "FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Encounter workflow history and explicit task state are retained evidence."
  end

  private

  def create_workflow_events
    create_table :clinic_encounter_workflow_events do |t|
      tenant_encounter_columns(t)
      t.bigint :actor_membership_id, null: false
      t.string :event_code, null: false
      t.string :from_stage, null: false
      t.string :to_stage, null: false
      t.integer :workflow_version, null: false
      t.string :request_key, null: false
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    add_index :clinic_encounter_workflow_events, %i[practice_id encounter_id workflow_version], unique: true,
      name: "idx_encounter_workflow_events_version"
    add_index :clinic_encounter_workflow_events, %i[practice_id actor_membership_id request_key], unique: true,
      name: "idx_encounter_workflow_events_request"
    add_context_foreign_keys(:clinic_encounter_workflow_events, prefix: "workflow_events")
    add_membership_foreign_key(:clinic_encounter_workflow_events, :actor_membership_id, "workflow_events_actor")
    add_check_constraint :clinic_encounter_workflow_events,
      "event_code IN ('checked_in')", name: "encounter_workflow_events_code"
    add_check_constraint :clinic_encounter_workflow_events,
      "from_stage IN (#{quoted(WORKFLOW_STATES)}) AND to_stage IN (#{quoted(WORKFLOW_STATES)})",
      name: "encounter_workflow_events_stages"
    add_check_constraint :clinic_encounter_workflow_events,
      "workflow_version > 0 AND length(trim(request_key)) > 0", name: "encounter_workflow_events_values"
  end

  def create_intake_records
    create_table :clinic_encounter_intakes do |t|
      tenant_encounter_columns(t)
      t.integer :current_revision_no, null: false, default: 0
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_encounter_intakes, %i[practice_id encounter_id], unique: true,
      name: "idx_encounter_intakes_canonical"
    add_index :clinic_encounter_intakes, %i[practice_id patient_id encounter_id id], unique: true,
      name: "idx_encounter_intakes_context"
    add_context_foreign_keys(:clinic_encounter_intakes, prefix: "intakes")
    add_check_constraint :clinic_encounter_intakes, "current_revision_no >= 0", name: "encounter_intakes_revision"

    create_table :clinic_encounter_intake_revisions do |t|
      tenant_encounter_columns(t)
      t.bigint :encounter_intake_id, null: false
      t.integer :revision_no, null: false
      t.string :completeness_state, null: false
      t.string :information_source, null: false
      t.bigint :author_membership_id, null: false
      t.datetime :recorded_at, null: false
      t.timestamps
    end
    add_index :clinic_encounter_intake_revisions, %i[practice_id encounter_intake_id revision_no], unique: true,
      name: "idx_encounter_intake_revisions_number"
    add_index :clinic_encounter_intake_revisions, %i[practice_id patient_id encounter_id id], unique: true,
      name: "idx_encounter_intake_revisions_context"
    add_context_foreign_keys(:clinic_encounter_intake_revisions, prefix: "intake_revisions")
    add_foreign_key :clinic_encounter_intake_revisions, :clinic_encounter_intakes,
      column: %i[practice_id patient_id encounter_id encounter_intake_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_intake_revisions_intake"
    add_membership_foreign_key(:clinic_encounter_intake_revisions, :author_membership_id, "intake_revisions_author")
    add_check_constraint :clinic_encounter_intake_revisions,
      "revision_no > 0 AND completeness_state IN ('incomplete', 'complete', 'unknown')",
      name: "encounter_intake_revisions_state"
    add_check_constraint :clinic_encounter_intake_revisions,
      "information_source IN ('patient', 'caregiver', 'clinician', 'external_record', 'other')",
      name: "encounter_intake_revisions_source"

    create_table :clinic_encounter_intake_items do |t|
      tenant_encounter_columns(t)
      t.bigint :intake_revision_id, null: false
      t.string :field_code, null: false
      t.string :value_state, null: false
      t.string :value_type, null: false
      t.boolean :boolean_value
      t.decimal :decimal_value, precision: 30, scale: 10
      t.string :coded_value
      t.date :date_value
      t.string :unit_code
      t.timestamps
    end
    add_index :clinic_encounter_intake_items, %i[practice_id intake_revision_id field_code], unique: true,
      name: "idx_encounter_intake_items_field"
    add_context_foreign_keys(:clinic_encounter_intake_items, prefix: "intake_items")
    add_foreign_key :clinic_encounter_intake_items, :clinic_encounter_intake_revisions,
      column: %i[practice_id patient_id encounter_id intake_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_intake_items_revision"
    add_check_constraint :clinic_encounter_intake_items,
      "field_code IN ('patient_identity_confirmed', 'visit_reason_confirmed', 'allergy_list_reviewed', " \
      "'medication_list_reviewed', 'care_needs_reviewed')", name: "encounter_intake_items_field"
    add_check_constraint :clinic_encounter_intake_items,
      "value_state IN ('known', 'not_recorded', 'incomplete', 'unknown', 'declined', 'unable_to_obtain')",
      name: "encounter_intake_items_state"
    add_check_constraint :clinic_encounter_intake_items,
      "value_type IN ('boolean', 'decimal', 'coded', 'date')", name: "encounter_intake_items_type"
    add_check_constraint :clinic_encounter_intake_items, intake_value_shape_sql,
      name: "encounter_intake_items_value_shape"
  end

  def create_triage_evidence
    add_index :clinic_observations, %i[practice_id patient_id encounter_id id], unique: true,
      name: "idx_observations_triage_context"
    add_index :clinic_patient_history_reviews, %i[practice_id patient_id encounter_id id], unique: true,
      name: "idx_history_reviews_triage_context"
    create_table :clinic_encounter_triage_evidence do |t|
      tenant_encounter_columns(t)
      t.bigint :author_membership_id, null: false
      t.string :evidence_kind, null: false
      t.string :evidence_state, null: false
      t.bigint :intake_revision_id
      t.bigint :observation_id
      t.bigint :history_review_id
      t.datetime :recorded_at, null: false
      t.timestamps
    end
    add_index :clinic_encounter_triage_evidence,
      %i[practice_id encounter_id evidence_kind intake_revision_id observation_id history_review_id], unique: true,
      name: "idx_encounter_triage_evidence_source"
    add_context_foreign_keys(:clinic_encounter_triage_evidence, prefix: "triage_evidence")
    add_membership_foreign_key(:clinic_encounter_triage_evidence, :author_membership_id, "triage_evidence_author")
    add_foreign_key :clinic_encounter_triage_evidence, :clinic_encounter_intake_revisions,
      column: %i[practice_id patient_id encounter_id intake_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_triage_evidence_intake_revision"
    add_foreign_key :clinic_encounter_triage_evidence, :clinic_observations,
      column: %i[practice_id patient_id encounter_id observation_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_triage_evidence_observation"
    add_foreign_key :clinic_encounter_triage_evidence, :clinic_patient_history_reviews,
      column: %i[practice_id patient_id encounter_id history_review_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_triage_evidence_history_review"
    add_check_constraint :clinic_encounter_triage_evidence,
      "evidence_kind IN ('intake_revision', 'observation', 'history_review')", name: "triage_evidence_kind"
    add_check_constraint :clinic_encounter_triage_evidence,
      "evidence_state IN ('known', 'incomplete', 'unknown', 'unable_to_obtain')", name: "triage_evidence_state"
    add_check_constraint :clinic_encounter_triage_evidence, <<~SQL.squish, name: "triage_evidence_source_shape"
      (evidence_kind = 'intake_revision' AND intake_revision_id IS NOT NULL AND observation_id IS NULL AND history_review_id IS NULL)
      OR (evidence_kind = 'observation' AND intake_revision_id IS NULL AND observation_id IS NOT NULL AND history_review_id IS NULL)
      OR (evidence_kind = 'history_review' AND intake_revision_id IS NULL AND observation_id IS NULL AND history_review_id IS NOT NULL)
    SQL
  end

  def create_handoff_records
    create_table :clinic_encounter_handoffs do |t|
      tenant_encounter_columns(t)
      t.bigint :intake_revision_id, null: false
      t.bigint :requested_by_membership_id, null: false
      t.bigint :requested_to_membership_id, null: false
      t.bigint :accepted_by_membership_id
      t.string :state, null: false
      t.datetime :resolved_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_encounter_handoffs, %i[practice_id patient_id encounter_id id], unique: true,
      name: "idx_encounter_handoffs_context"
    add_index :clinic_encounter_handoffs, %i[practice_id encounter_id], unique: true,
      where: "state IN ('pending', 'correction_requested', 'accepted')", name: "idx_encounter_handoffs_active"
    add_context_foreign_keys(:clinic_encounter_handoffs, prefix: "handoffs")
    add_foreign_key :clinic_encounter_handoffs, :clinic_encounter_intake_revisions,
      column: %i[practice_id patient_id encounter_id intake_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_handoffs_intake_revision"
    %i[requested_by_membership_id requested_to_membership_id accepted_by_membership_id].each do |column|
      add_membership_foreign_key(:clinic_encounter_handoffs, column, "handoffs_#{column.to_s.delete_suffix('_membership_id')}")
    end
    add_check_constraint :clinic_encounter_handoffs,
      "state IN ('pending', 'accepted', 'rejected', 'correction_requested', 'completed')",
      name: "encounter_handoffs_state"
    add_check_constraint :clinic_encounter_handoffs, <<~SQL.squish, name: "encounter_handoffs_state_evidence"
      (state IN ('accepted', 'completed') AND accepted_by_membership_id IS NOT NULL)
      OR (state IN ('pending', 'rejected', 'correction_requested') AND accepted_by_membership_id IS NULL)
    SQL
    add_check_constraint :clinic_encounter_handoffs,
      "(state IN ('rejected', 'completed') AND resolved_at IS NOT NULL) OR (state NOT IN ('rejected', 'completed') AND resolved_at IS NULL)",
      name: "encounter_handoffs_resolution"

    create_table :clinic_encounter_handoff_events do |t|
      tenant_encounter_columns(t)
      t.bigint :encounter_handoff_id, null: false
      t.bigint :actor_membership_id, null: false
      t.string :event_code, null: false
      t.string :from_state
      t.string :to_state, null: false
      t.integer :handoff_version, null: false
      t.string :request_key, null: false
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    add_index :clinic_encounter_handoff_events, %i[practice_id encounter_handoff_id handoff_version], unique: true,
      name: "idx_encounter_handoff_events_version"
    add_index :clinic_encounter_handoff_events, %i[practice_id actor_membership_id request_key], unique: true,
      name: "idx_encounter_handoff_events_request"
    add_context_foreign_keys(:clinic_encounter_handoff_events, prefix: "handoff_events")
    add_foreign_key :clinic_encounter_handoff_events, :clinic_encounter_handoffs,
      column: %i[practice_id patient_id encounter_id encounter_handoff_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_handoff_events_handoff"
    add_membership_foreign_key(:clinic_encounter_handoff_events, :actor_membership_id, "handoff_events_actor")
    add_check_constraint :clinic_encounter_handoff_events,
      "event_code IN ('requested', 'accepted', 'rejected', 'correction_requested', 'completed')",
      name: "encounter_handoff_events_code"
    add_check_constraint :clinic_encounter_handoff_events,
      "to_state IN ('pending', 'accepted', 'rejected', 'correction_requested', 'completed') AND handoff_version >= 0",
      name: "encounter_handoff_events_values"
  end

  def create_clinical_tasks
    create_table :clinic_clinical_tasks do |t|
      tenant_encounter_columns(t)
      t.string :kind, null: false
      t.string :status, null: false
      t.string :priority, null: false
      t.string :pool_code, null: false
      t.bigint :assigned_to_membership_id
      t.bigint :created_by_membership_id, null: false
      t.bigint :resolved_by_membership_id
      t.datetime :due_at
      t.datetime :resolved_at
      t.string :resolution_code
      t.string :source_type, null: false
      t.bigint :source_id, null: false
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_clinical_tasks, %i[practice_id status due_at id], name: "idx_clinical_tasks_worklist"
    add_index :clinic_clinical_tasks, %i[practice_id encounter_id status id], name: "idx_clinical_tasks_encounter"
    add_context_foreign_keys(:clinic_clinical_tasks, prefix: "clinical_tasks")
    %i[assigned_to_membership_id created_by_membership_id resolved_by_membership_id].each do |column|
      add_membership_foreign_key(:clinic_clinical_tasks, column, "clinical_tasks_#{column.to_s.delete_suffix('_membership_id')}")
    end
    add_check_constraint :clinic_clinical_tasks,
      "kind IN ('intake', 'triage', 'handoff', 'order_execution', 'result_follow_up', 'patient_contact', 'records_review')",
      name: "clinical_tasks_kind"
    add_check_constraint :clinic_clinical_tasks,
      "status IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')", name: "clinical_tasks_status"
    add_check_constraint :clinic_clinical_tasks,
      "priority IN ('routine', 'time_sensitive') AND length(trim(pool_code)) > 0", name: "clinical_tasks_priority"
    add_check_constraint :clinic_clinical_tasks,
      "source_type IN ('workflow', 'intake', 'triage', 'handoff', 'medication_request', 'service_request', 'lab_report', 'message', 'document') AND source_id > 0",
      name: "clinical_tasks_source"
    add_check_constraint :clinic_clinical_tasks, <<~SQL.squish, name: "clinical_tasks_resolution"
      (status IN ('completed', 'cancelled') AND resolved_at IS NOT NULL AND resolved_by_membership_id IS NOT NULL AND resolution_code IS NOT NULL)
      OR (status NOT IN ('completed', 'cancelled') AND resolved_at IS NULL AND resolved_by_membership_id IS NULL AND resolution_code IS NULL)
    SQL
  end

  def tenant_encounter_columns(table)
    table.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
    table.bigint :patient_id, null: false
    table.bigint :encounter_id, null: false
  end

  def add_context_foreign_keys(table, prefix:)
    add_foreign_key table, :clinic_patients, column: %i[practice_id patient_id],
      primary_key: %i[practice_id id], name: "fk_#{prefix}_patient"
    add_foreign_key table, :clinic_encounters, column: %i[practice_id patient_id encounter_id],
      primary_key: %i[practice_id patient_id id], name: "fk_#{prefix}_encounter"
  end

  def add_membership_foreign_key(table, column, name)
    add_foreign_key table, :clinic_memberships, column: [ :practice_id, column ],
      primary_key: %i[practice_id id], name: "fk_#{name}"
  end

  def quoted(values)
    values.map { |value| connection.quote(value) }.join(", ")
  end

  def intake_value_shape_sql
    <<~SQL.squish
      (value_state <> 'known' AND boolean_value IS NULL AND decimal_value IS NULL AND coded_value IS NULL AND date_value IS NULL AND unit_code IS NULL)
      OR (value_state = 'known' AND (
        (value_type = 'boolean' AND boolean_value IS NOT NULL AND decimal_value IS NULL AND coded_value IS NULL AND date_value IS NULL AND unit_code IS NULL)
        OR (value_type = 'decimal' AND boolean_value IS NULL AND decimal_value IS NOT NULL AND decimal_value <> 'NaN'::numeric AND coded_value IS NULL AND date_value IS NULL)
        OR (value_type = 'coded' AND boolean_value IS NULL AND decimal_value IS NULL AND coded_value IS NOT NULL AND length(trim(coded_value)) > 0 AND date_value IS NULL AND unit_code IS NULL)
        OR (value_type = 'date' AND boolean_value IS NULL AND decimal_value IS NULL AND coded_value IS NULL AND date_value IS NOT NULL AND unit_code IS NULL)
      ))
    SQL
  end
end
