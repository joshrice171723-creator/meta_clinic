class FixPatientEducationCiphertextConstraint < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :clinic_patient_education_events, name: "patient_education_evidence"
    # topic_title is encrypted. Its plaintext length is enforced by the model;
    # ciphertext length includes encryption metadata and cannot use that limit.
    add_check_constraint :clinic_patient_education_events,
      "char_length(trim(topic_title)) > 0 AND char_length(trim(language)) BETWEEN 1 AND 80 AND " \
      "(delivery_method NOT IN ('handout','portal') OR material_title IS NOT NULL) AND " \
      "(teach_back_status <> 'demonstrated' OR patient_response IS NOT NULL) AND " \
      "(teach_back_status <> 'needs_reteaching' OR (reteaching_summary IS NOT NULL AND follow_up_needed)) AND " \
      "(NOT follow_up_needed OR follow_up_plan IS NOT NULL)", name: "patient_education_evidence"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Valid encrypted education history may exceed the old ciphertext limit; use a forward migration."
  end
end
