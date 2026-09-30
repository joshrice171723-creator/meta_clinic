class AddPatientMergeEvidence < ActiveRecord::Migration[8.0]
  def change
    add_reference :clinic_patients, :merged_into_patient, foreign_key: { to_table: :clinic_patients }
    add_reference :clinic_patients, :merged_by_membership, foreign_key: { to_table: :clinic_memberships }
    add_column :clinic_patients, :merged_at, :datetime
    add_column :clinic_patients, :merge_reason, :text
    add_check_constraint :clinic_patients,
      "(merged_into_patient_id IS NULL AND merged_by_membership_id IS NULL AND merged_at IS NULL AND merge_reason IS NULL) OR " \
      "(merged_into_patient_id IS NOT NULL AND merged_by_membership_id IS NOT NULL AND merged_at IS NOT NULL AND merge_reason IS NOT NULL)",
      name: "clinic_patients_merge_evidence_shape"
    add_check_constraint :clinic_patients, "merged_into_patient_id IS NULL OR merged_into_patient_id <> id",
      name: "clinic_patients_cannot_merge_into_self"
  end
end
