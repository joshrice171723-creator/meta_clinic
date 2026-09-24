class AddSiteSchedulingPolicyAndSeries < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_site_scheduling_policies do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.integer :revision, null: false
      t.boolean :recurrence_enabled, null: false, default: false
      t.boolean :overbook_enabled, null: false, default: false
      t.bigint :eligible_visit_type_ids, array: true, null: false, default: []
      t.bigint :written_by_membership_id, null: false
      t.datetime :effective_from, null: false
      t.timestamps
    end
    add_index :clinic_site_scheduling_policies, %i[practice_id site_id revision], unique: true,
      name: "clinic_site_scheduling_policy_revision"
    add_index :clinic_site_scheduling_policies, %i[practice_id id], unique: true
    add_foreign_key :clinic_site_scheduling_policies, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_site_scheduling_policies, :clinic_memberships,
      column: %i[practice_id written_by_membership_id], primary_key: %i[practice_id id]
    add_check_constraint :clinic_site_scheduling_policies, "revision > 0", name: "clinic_site_scheduling_policy_revision_positive"
    execute <<~SQL
      CREATE TRIGGER clinic_site_scheduling_policies_immutable
      BEFORE UPDATE OR DELETE ON clinic_site_scheduling_policies
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL

    create_table :clinic_appointment_series do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :booked_clinician_id, null: false
      t.bigint :visit_type_id, null: false
      t.bigint :room_id
      t.bigint :service_offering_id
      t.string :visit_modality, null: false
      t.string :timezone, null: false
      t.date :starts_on, null: false
      t.string :local_start_time, null: false
      t.integer :duration_minutes, null: false
      t.integer :interval_weeks, null: false
      t.integer :occurrence_count, null: false
      t.bigint :policy_revision, null: false
      t.bigint :created_by_membership_id, null: false
      t.timestamps
    end
    add_index :clinic_appointment_series, %i[practice_id id], unique: true
    add_foreign_key :clinic_appointment_series, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_series, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_series, :clinic_clinician_profiles,
      column: %i[practice_id booked_clinician_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_series, :clinic_visit_types,
      column: %i[practice_id visit_type_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_series, :clinic_memberships,
      column: %i[practice_id created_by_membership_id], primary_key: %i[practice_id id]
    add_check_constraint :clinic_appointment_series,
      "interval_weeks BETWEEN 1 AND 4 AND occurrence_count BETWEEN 2 AND 12 AND duration_minutes > 0",
      name: "clinic_appointment_series_bounds"
    add_check_constraint :clinic_appointment_series, "visit_modality IN ('in_person', 'video')",
      name: "clinic_appointment_series_modality"

    create_table :clinic_appointment_series_occurrences do |t|
      t.bigint :practice_id, null: false
      t.bigint :series_id, null: false
      t.integer :sequence, null: false
      t.date :original_date, null: false
      t.bigint :appointment_id
      t.string :state, null: false
      t.text :skip_reason
      t.bigint :resolved_by_membership_id, null: false
      t.timestamps
    end
    add_index :clinic_appointment_series_occurrences, %i[practice_id series_id sequence], unique: true,
      name: "clinic_appointment_series_occurrence_sequence"
    add_index :clinic_appointment_series_occurrences, %i[practice_id appointment_id], unique: true,
      where: "appointment_id IS NOT NULL", name: "clinic_appointment_series_occurrence_appointment"
    add_foreign_key :clinic_appointment_series_occurrences, :clinic_appointment_series,
      column: %i[practice_id series_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_series_occurrences, :clinic_appointments,
      column: %i[practice_id appointment_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_series_occurrences, :clinic_memberships,
      column: %i[practice_id resolved_by_membership_id], primary_key: %i[practice_id id]
    add_check_constraint :clinic_appointment_series_occurrences,
      "(state = 'booked' AND appointment_id IS NOT NULL AND skip_reason IS NULL) OR " \
      "(state = 'skipped' AND appointment_id IS NULL AND length(trim(skip_reason)) > 0)",
      name: "clinic_appointment_series_occurrence_resolution"
    execute <<~SQL
      CREATE TRIGGER clinic_appointment_series_occurrences_immutable
      BEFORE UPDATE OR DELETE ON clinic_appointment_series_occurrences
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL

    add_column :clinic_appointments, :clinician_allocation, :integer, null: false, default: 1
    add_check_constraint :clinic_appointments, "clinician_allocation BETWEEN 1 AND 2",
      name: "clinic_appointments_clinician_allocation_bound"
    execute <<~SQL
      ALTER TABLE clinic_appointments DROP CONSTRAINT clinic_appointments_no_provider_overlap;
      ALTER TABLE clinic_appointments ADD CONSTRAINT clinic_appointments_no_provider_overlap
        EXCLUDE USING gist (practice_id WITH =, booked_clinician_id WITH =, clinician_allocation WITH =,
          tstzrange(starts_at, ends_at, '[)') WITH &&)
        WHERE (booked_clinician_id IS NOT NULL AND status IN ('scheduled', 'confirmed'));
    SQL

    create_table :clinic_appointment_overbook_exceptions do |t|
      t.bigint :practice_id, null: false
      t.bigint :appointment_id, null: false
      t.bigint :site_id, null: false
      t.bigint :written_by_membership_id, null: false
      t.integer :policy_revision, null: false
      t.bigint :conflicting_appointment_ids, array: true, null: false, default: []
      t.text :reason, null: false
      t.timestamps
    end
    add_index :clinic_appointment_overbook_exceptions, %i[practice_id appointment_id], unique: true,
      name: "clinic_appointment_overbook_exception_appointment"
    add_foreign_key :clinic_appointment_overbook_exceptions, :clinic_appointments,
      column: %i[practice_id appointment_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_overbook_exceptions, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_overbook_exceptions, :clinic_memberships,
      column: %i[practice_id written_by_membership_id], primary_key: %i[practice_id id]
    add_check_constraint :clinic_appointment_overbook_exceptions, "policy_revision > 0 AND length(trim(reason)) > 0",
      name: "clinic_appointment_overbook_exception_required_fields"
    execute <<~SQL
      CREATE TRIGGER clinic_appointment_overbook_exceptions_immutable
      BEFORE UPDATE OR DELETE ON clinic_appointment_overbook_exceptions
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Retain scheduling policy, series, and overbook provenance; use a reviewed forward migration."
  end
end
