class AddReferenceToClinicianProfiles < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_clinician_profiles, :reference, :string unless column_exists?(:clinic_clinician_profiles, :reference)
    unless index_exists?(:clinic_clinician_profiles, [ :practice_id, :reference ], name: "clinic_clinician_profiles_reference")
      add_index :clinic_clinician_profiles, [ :practice_id, :reference ], unique: true,
        where: "reference IS NOT NULL", name: "clinic_clinician_profiles_reference"
    end
  end
end
