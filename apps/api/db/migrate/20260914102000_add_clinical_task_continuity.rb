class AddClinicalTaskContinuity < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_clinical_tasks, :pending_assignee_membership_id, :bigint
    add_foreign_key :clinic_clinical_tasks, :clinic_memberships,
      column: %i[practice_id pending_assignee_membership_id], primary_key: %i[practice_id id],
      name: "fk_task_pending_assignee"
    remove_check_constraint :clinic_clinical_tasks, name: "clinic_tasks_state_evidence"
    add_check_constraint :clinic_clinical_tasks, <<~SQL.squish, name: "clinic_tasks_state_evidence"
      task_kind IN ('intake','handoff','result_follow_up','patient_call','order_execution','record_request','staff_request')
      AND state IN ('open','claimed','in_progress','on_hold','completed','cancelled')
      AND pool_code IN ('clinical','front_desk','records')
      AND source_type IN ('manual','encounter','handoff','lab_follow_up','message','reminder','order')
      AND ((state = 'completed' AND resolution_code IS NOT NULL AND completed_by_membership_id IS NOT NULL AND completed_at IS NOT NULL)
        OR (state <> 'completed' AND resolution_code IS NULL AND completed_by_membership_id IS NULL AND completed_at IS NULL))
    SQL
    remove_index :clinic_clinical_tasks, name: "clinic_tasks_active_order_source"
    add_index :clinic_clinical_tasks, %i[practice_id source_type source_kind source_id], unique: true,
      where: "source_type = 'order' AND source_kind IS NOT NULL AND state IN ('open','claimed','in_progress','on_hold')",
      name: "clinic_tasks_active_order_source"
    create_table :clinic_clinical_task_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :task_id, null: false
      t.bigint :actor_membership_id, null: false
      t.string :action, null: false
      t.integer :task_version, null: false
      t.jsonb :snapshot, null: false, default: {}
      t.datetime :recorded_at, null: false
    end
    add_foreign_key :clinic_clinical_task_events, :clinic_clinical_tasks,
      column: %i[practice_id task_id], primary_key: %i[practice_id id], name: "fk_task_events_task"
    add_foreign_key :clinic_clinical_task_events, :clinic_memberships,
      column: %i[practice_id actor_membership_id], primary_key: %i[practice_id id], name: "fk_task_events_actor"
    add_index :clinic_clinical_task_events, %i[practice_id task_id id], name: "clinic_task_events_history"
    add_check_constraint :clinic_clinical_task_events,
      "task_version >= 0 AND jsonb_typeof(snapshot) = 'object'", name: "clinic_task_events_evidence"
    execute <<~SQL
      CREATE FUNCTION clinic_task_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Task events are append-only'; END; $$;
      CREATE TRIGGER clinic_task_events_immutable BEFORE UPDATE OR DELETE ON clinic_clinical_task_events
      FOR EACH ROW EXECUTE FUNCTION clinic_task_events_immutable();
    SQL
    create_table :clinic_clinical_task_dependencies do |t|
      t.bigint :practice_id, null: false
      t.bigint :task_id, null: false
      t.bigint :prerequisite_id, null: false
      t.timestamps
    end
    add_foreign_key :clinic_clinical_task_dependencies, :clinic_clinical_tasks,
      column: %i[practice_id task_id], primary_key: %i[practice_id id], name: "fk_task_dependency_task"
    add_foreign_key :clinic_clinical_task_dependencies, :clinic_clinical_tasks,
      column: %i[practice_id prerequisite_id], primary_key: %i[practice_id id], name: "fk_task_dependency_prerequisite"
    add_index :clinic_clinical_task_dependencies, %i[task_id prerequisite_id], unique: true,
      name: "clinic_task_dependency_unique"
    add_check_constraint :clinic_clinical_task_dependencies, "task_id <> prerequisite_id", name: "clinic_task_dependency_not_self"
    execute <<~SQL
      CREATE FUNCTION clinic_task_dependency_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE task_patient bigint; prerequisite_patient bigint;
      BEGIN
        PERFORM id FROM clinic_practices WHERE id = NEW.practice_id FOR UPDATE;
        SELECT patient_id INTO task_patient FROM clinic_clinical_tasks WHERE practice_id = NEW.practice_id AND id = NEW.task_id;
        SELECT patient_id INTO prerequisite_patient FROM clinic_clinical_tasks WHERE practice_id = NEW.practice_id AND id = NEW.prerequisite_id;
        IF task_patient IS NULL OR prerequisite_patient IS NULL OR task_patient <> prerequisite_patient THEN
          RAISE EXCEPTION 'Task dependency context mismatch';
        END IF;
        IF EXISTS (
          WITH RECURSIVE reachable(id) AS (
            SELECT NEW.prerequisite_id
            UNION
            SELECT edge.prerequisite_id FROM clinic_clinical_task_dependencies edge JOIN reachable ON edge.task_id = reachable.id
            WHERE edge.practice_id = NEW.practice_id AND edge.id IS DISTINCT FROM NEW.id
          ) SELECT 1 FROM reachable WHERE id = NEW.task_id
        ) THEN RAISE EXCEPTION 'Task dependency cycle'; END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER clinic_task_dependency_guard BEFORE INSERT OR UPDATE ON clinic_clinical_task_dependencies
      FOR EACH ROW EXECUTE FUNCTION clinic_task_dependency_guard();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Task responsibility and dependency history must be preserved."
  end
end
