class AllowConditionsHistoryReviews < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :clinic_patient_history_reviews, name: "clinic_history_reviews_topic"
    add_check_constraint :clinic_patient_history_reviews,
      "topic IN ('allergies', 'medications', 'conditions', 'care_needs')", name: "clinic_history_reviews_topic"
  end

  def down
    if select_value("SELECT EXISTS (SELECT 1 FROM clinic_patient_history_reviews WHERE topic = 'conditions')")
      raise ActiveRecord::IrreversibleMigration, "Preserve recorded append-only Conditions reviews before rollback."
    end
    remove_check_constraint :clinic_patient_history_reviews, name: "clinic_history_reviews_topic"
    add_check_constraint :clinic_patient_history_reviews,
      "topic IN ('allergies', 'medications', 'care_needs')", name: "clinic_history_reviews_topic"
  end
end
