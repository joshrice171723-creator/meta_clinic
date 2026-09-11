class CreateClinicCapacityAndWaitlist < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_capacity_rules do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.bigint :clinician_id, null: false
      t.string :kind, null: false
      t.integer :weekday
      t.integer :start_minute
      t.integer :end_minute
      t.datetime :starts_at
      t.datetime :ends_at
      t.boolean :active, null: false, default: true
      t.text :reason
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_capacity_rules, [:practice_id, :id], unique: true
    add_index :clinic_capacity_rules, [:practice_id, :clinician_id, :site_id, :active], name: "clinic_capacity_rules_lookup"
    add_check_constraint :clinic_capacity_rules,
      "(kind = 'weekly' AND weekday IS NOT NULL AND start_minute IS NOT NULL AND end_minute IS NOT NULL AND weekday BETWEEN 0 AND 6 AND start_minute >= 0 AND end_minute <= 1440 AND end_minute > start_minute AND starts_at IS NULL AND ends_at IS NULL) OR (kind = 'block' AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at AND weekday IS NULL AND start_minute IS NULL AND end_minute IS NULL)",
      name: "clinic_capacity_rules_shape"

    create_table :clinic_waitlist_entries do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :site_id, null: false
      t.bigint :clinician_id, null: false
      t.bigint :visit_type_id, null: false
      t.bigint :appointment_id
      t.datetime :earliest_at, null: false
      t.datetime :latest_at, null: false
      t.integer :duration_minutes, null: false
      t.string :state, null: false, default: "waiting"
      t.datetime :offer_starts_at
      t.datetime :offer_ends_at
      t.datetime :offer_expires_at
      t.text :reason
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_waitlist_entries, [:practice_id, :id], unique: true
    add_index :clinic_waitlist_entries, [:practice_id, :state, :created_at], name: "clinic_waitlist_queue"
    add_check_constraint :clinic_waitlist_entries,
      "state IN ('waiting','offered','booked','cancelled') AND latest_at > earliest_at AND duration_minutes BETWEEN 5 AND 240 AND (state <> 'offered' OR (offer_starts_at IS NOT NULL AND offer_ends_at IS NOT NULL AND offer_ends_at > offer_starts_at AND offer_expires_at IS NOT NULL AND offer_expires_at <= offer_starts_at)) AND (state <> 'booked' OR appointment_id IS NOT NULL)",
      name: "clinic_waitlist_entry_shape"
    [:clinic_capacity_rules, :clinic_waitlist_entries].each do |table|
      add_foreign_key table, :clinic_practices, column: :practice_id
      add_foreign_key table, :clinic_sites, column: [:practice_id, :site_id], primary_key: [:practice_id, :id]
      add_foreign_key table, :clinic_clinician_profiles, column: [:practice_id, :clinician_id], primary_key: [:practice_id, :id]
    end
    add_foreign_key :clinic_waitlist_entries, :clinic_patients, column: [:practice_id, :patient_id], primary_key: [:practice_id, :id]
    add_foreign_key :clinic_waitlist_entries, :clinic_visit_types, column: [:practice_id, :visit_type_id], primary_key: [:practice_id, :id]
    add_index :clinic_appointments, [:practice_id, :patient_id, :id], unique: true, name: "clinic_appointments_waitlist_context"
    add_foreign_key :clinic_waitlist_entries, :clinic_appointments, column: [:practice_id, :patient_id, :appointment_id], primary_key: [:practice_id, :patient_id, :id]
  end
end
