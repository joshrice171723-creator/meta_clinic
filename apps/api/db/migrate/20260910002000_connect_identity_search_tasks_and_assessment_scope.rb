class ConnectIdentitySearchTasksAndAssessmentScope < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_patients, :identity_search_tokens, :text, array: true, null: false, default: []
    add_index :clinic_patients, :identity_search_tokens, using: :gin,
      name: "index_clinic_patients_on_identity_search_tokens"

    remove_check_constraint :clinic_clinical_tasks, name: "clinic_tasks_state_evidence"
    add_check_constraint :clinic_clinical_tasks,
      "task_kind IN ('intake','handoff','result_follow_up','patient_call','order_execution','record_request','staff_request') AND " \
      "state IN ('open','claimed','in_progress','completed','cancelled') AND " \
      "pool_code IN ('clinical','front_desk','records') AND " \
      "source_type IN ('manual','encounter','handoff','lab_follow_up','message','reminder','order') AND " \
      "((state = 'completed' AND resolution_code IS NOT NULL AND completed_by_membership_id IS NOT NULL AND completed_at IS NOT NULL) OR " \
      "(state <> 'completed' AND resolution_code IS NULL AND completed_by_membership_id IS NULL AND completed_at IS NULL))",
      name: "clinic_tasks_state_evidence"
    add_index :clinic_clinical_tasks, %i[practice_id source_type source_id], unique: true,
      where: "source_type IN ('message','reminder') AND source_id IS NOT NULL",
      name: "clinic_tasks_staff_source"

    Clinic::Care::Patient.reset_column_information
    Clinic::Care::Patient.find_each do |patient|
      Clinic::Care::PatientIdentitySearch.refresh!(patient)
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Patient matching indexes and clinical task evidence must be preserved with a forward migration."
  end
end
