class IndexPatientCareSummaryRecords < ActiveRecord::Migration[8.1]
  def change
    {
      clinic_conditions: %i[recorded_by_membership_id reviewed_by_membership_id],
      clinic_allergies: %i[recorded_by_membership_id reviewed_by_membership_id],
      clinic_medication_statements: %i[recorded_by_membership_id reviewed_by_membership_id],
      clinic_patient_care_needs: %i[recorded_by_membership_id reviewed_by_membership_id],
      clinic_encounter_precautions: %i[recorded_by_membership_id reassessed_by_membership_id],
      clinic_patient_history_reviews: %i[reviewer_membership_id]
    }.each do |table, columns|
      columns.each do |column|
        add_index table, [ :practice_id, column ], name: "#{table}_#{column}_fk"
      end
    end
    add_index :clinic_encounter_precautions, [ :practice_id, :patient_id, :encounter_id ],
      name: "clinic_precautions_patient_encounter_fk"
  end
end
