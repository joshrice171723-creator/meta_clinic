class AddLabReportActions < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_lab_report_actions do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :lab_report_version_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.bigint :clinical_task_id
      t.bigint :replacement_report_id
      t.string :kind, null: false
      t.string :request_key, null: false
      t.text :note
      t.datetime :recorded_at, null: false
    end
    add_index :clinic_lab_report_actions, %i[practice_id request_key], unique: true
    add_index :clinic_lab_report_actions, %i[lab_report_version_id kind], unique: true
    { practice_id: :clinic_practices, patient_id: :clinic_patients, lab_report_version_id: :clinic_lab_report_versions,
      recorded_by_membership_id: :clinic_memberships, clinical_task_id: :clinic_clinical_tasks,
      replacement_report_id: :clinic_lab_reports }.each do |column, table|
      add_foreign_key :clinic_lab_report_actions, table, column:
    end
    remove_check_constraint :clinic_lab_specimens,
      "condition_code IN ('satisfactory','compromised','unknown') AND char_length(trim(specimen_type_code)) BETWEEN 1 AND 80 AND char_length(trim(specimen_type_display)) BETWEEN 1 AND 160",
      name: "lab_specimens_values"
    add_check_constraint :clinic_lab_specimens,
      "condition_code IN ('satisfactory', 'compromised', 'unknown', 'rejected') AND " \
      "char_length(trim(specimen_type_code)) BETWEEN 1 AND 80 AND char_length(trim(specimen_type_display)) BETWEEN 1 AND 160",
      name: "lab_specimens_values"
    add_foreign_key :clinic_lab_report_actions, :clinic_lab_report_versions,
      column: %i[practice_id patient_id lab_report_version_id], primary_key: %i[practice_id patient_id id], name: "lab_action_version_context"
    add_foreign_key :clinic_lab_report_actions, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id], name: "lab_action_actor_tenant"
    add_foreign_key :clinic_lab_report_actions, :clinic_clinical_tasks,
      column: %i[practice_id clinical_task_id], primary_key: %i[practice_id id], name: "lab_action_task_tenant"
    add_check_constraint :clinic_lab_report_actions, "kind IN ('acknowledged','recollection_requested','recollection_completed')", name: "lab_action_kind"
    reversible do |direction|
      direction.up { execute "CREATE TRIGGER lab_report_actions_immutable BEFORE UPDATE OR DELETE ON clinic_lab_report_actions FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()" }
      direction.down { execute "DROP TRIGGER lab_report_actions_immutable ON clinic_lab_report_actions" }
    end
  end
end
