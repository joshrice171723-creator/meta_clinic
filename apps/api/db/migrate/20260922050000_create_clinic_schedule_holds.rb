class CreateClinicScheduleHolds < ActiveRecord::Migration[8.0]
  def change
    create_table :clinic_schedule_holds do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id
      t.bigint :site_id, null: false
      t.bigint :clinician_id, null: false
      t.bigint :room_id
      t.datetime :starts_at, null: false
      t.datetime :ends_at, null: false
      t.datetime :expires_at, null: false
      t.string :state, null: false, default: "active", limit: 20
      t.string :request_key, null: false, limit: 160
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_schedule_holds, [ :practice_id, :id ], unique: true, name: "clinic_schedule_holds_practice_id"
    add_index :clinic_schedule_holds, [ :practice_id, :clinician_id, :state, :starts_at ], name: "clinic_schedule_holds_clinician"
    add_index :clinic_schedule_holds, [ :practice_id, :request_key ], unique: true, name: "clinic_schedule_holds_request"
    add_foreign_key :clinic_schedule_holds, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_schedule_holds, :clinic_patients, column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ], name: "fk_schedule_holds_patient"
    add_foreign_key :clinic_schedule_holds, :clinic_sites, column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ], name: "fk_schedule_holds_site"
    add_foreign_key :clinic_schedule_holds, :clinic_clinician_profiles, column: [ :practice_id, :clinician_id ], primary_key: [ :practice_id, :id ], name: "fk_schedule_holds_clinician"
    add_foreign_key :clinic_schedule_holds, :clinic_rooms, column: [ :practice_id, :site_id, :room_id ], primary_key: [ :practice_id, :site_id, :id ], name: "fk_schedule_holds_room"
    add_check_constraint :clinic_schedule_holds, "ends_at > starts_at AND state IN ('active','expired','released','converted','outcome_unknown') AND lock_version >= 0", name: "clinic_schedule_holds_values"

    add_column :clinic_appointments, :schedule_hold_id, :bigint
    add_index :clinic_appointments, [ :practice_id, :schedule_hold_id ], unique: true, where: "schedule_hold_id IS NOT NULL", name: "clinic_appointments_schedule_hold"
    add_foreign_key :clinic_appointments, :clinic_schedule_holds, column: [ :practice_id, :schedule_hold_id ], primary_key: [ :practice_id, :id ], name: "fk_appointments_schedule_hold"
  end
end
