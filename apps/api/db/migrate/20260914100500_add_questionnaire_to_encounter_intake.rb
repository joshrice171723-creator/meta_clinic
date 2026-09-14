class AddQuestionnaireToEncounterIntake < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_encounter_intake_revisions, :encrypted_questionnaire, :text
  end
end
