class AddPatientNameSearchTokens < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_patients, :name_search_tokens, :text, array: true, null: false, default: []
    add_index :clinic_patients, :name_search_tokens, using: :gin, name: "index_clinic_patients_on_name_search_tokens"

    Clinic::Care::Patient.reset_column_information
    Clinic::Care::Patient.find_each do |patient|
      patient.update_columns(
        name_search_tokens: Clinic::Care::PatientNameSearch.tokens_for(
          practice_id: patient.practice_id,
          name: patient.display_name
        )
      )
    end
  end

  def down
    remove_index :clinic_patients, name: "index_clinic_patients_on_name_search_tokens"
    remove_column :clinic_patients, :name_search_tokens
  end
end
