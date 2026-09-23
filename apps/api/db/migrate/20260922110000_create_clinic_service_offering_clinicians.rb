class CreateClinicServiceOfferingClinicians < ActiveRecord::Migration[8.0]
  def change
    create_table :clinic_service_offering_clinicians do |t|
      t.bigint :practice_id, null: false
      t.bigint :service_offering_id, null: false
      t.bigint :clinician_id, null: false
      t.timestamps
    end

    add_index :clinic_service_offering_clinicians, [ :practice_id, :service_offering_id, :clinician_id ],
      unique: true, name: "clinic_service_offering_clinicians_unique"
    add_index :clinic_service_offering_clinicians, [ :practice_id, :clinician_id, :service_offering_id ],
      name: "clinic_service_offering_clinicians_clinician"
    add_foreign_key :clinic_service_offering_clinicians, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_service_offering_clinicians, :clinic_service_offerings,
      column: [ :practice_id, :service_offering_id ], primary_key: [ :practice_id, :id ],
      name: "fk_service_offering_clinicians_offering"
    add_foreign_key :clinic_service_offering_clinicians, :clinic_clinician_profiles,
      column: [ :practice_id, :clinician_id ], primary_key: [ :practice_id, :id ],
      name: "fk_service_offering_clinicians_clinician"
  end
end
