class AddPrimarySiteToClinicPatients < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_patients, :primary_site_id, :bigint
    add_index :clinic_patients, [ :practice_id, :primary_site_id ], name: "clinic_patients_primary_site_id"
    add_foreign_key :clinic_patients, :clinic_sites,
      column: [ :practice_id, :primary_site_id ], primary_key: [ :practice_id, :id ], name: "fk_patients_primary_site"
  end
end
