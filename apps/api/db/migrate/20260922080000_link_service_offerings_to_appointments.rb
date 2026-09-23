class LinkServiceOfferingsToAppointments < ActiveRecord::Migration[8.0]
  def change
    add_column :clinic_appointments, :service_offering_id, :bigint
    add_column :clinic_appointments, :service_offering_snapshot, :jsonb
    add_index :clinic_appointments, [ :practice_id, :service_offering_id ],
      name: "clinic_appointments_service_offering"
    add_foreign_key :clinic_appointments, :clinic_service_offerings,
      column: [ :practice_id, :service_offering_id ], primary_key: [ :practice_id, :id ],
      name: "fk_clinic_appointments_service_offering"
    add_check_constraint :clinic_appointments,
      "(service_offering_id IS NULL) = (service_offering_snapshot IS NULL)",
      name: "clinic_appointments_offering_snapshot_pair"
  end
end
