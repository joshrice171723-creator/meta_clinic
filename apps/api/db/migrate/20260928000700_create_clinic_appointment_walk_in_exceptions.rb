class CreateClinicAppointmentWalkInExceptions < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_appointment_walk_in_exceptions do |t|
      t.bigint :practice_id, null: false
      t.bigint :appointment_id, null: false
      t.bigint :site_id, null: false
      t.bigint :written_by_membership_id, null: false
      t.text :reason, null: false
      t.timestamps
    end
    add_index :clinic_appointment_walk_in_exceptions, %i[practice_id appointment_id], unique: true,
      name: "clinic_appointment_walk_in_exception_appointment"
    add_foreign_key :clinic_appointment_walk_in_exceptions, :clinic_appointments,
      column: %i[practice_id appointment_id], primary_key: %i[practice_id id], name: "fk_walk_in_exception_appointment"
    add_foreign_key :clinic_appointment_walk_in_exceptions, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "fk_walk_in_exception_site"
    add_foreign_key :clinic_appointment_walk_in_exceptions, :clinic_memberships,
      column: %i[practice_id written_by_membership_id], primary_key: %i[practice_id id], name: "fk_walk_in_exception_writer"
    execute <<~SQL
      CREATE TRIGGER clinic_appointment_walk_in_exceptions_immutable
      BEFORE UPDATE OR DELETE ON clinic_appointment_walk_in_exceptions
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Retain walk-in scheduling provenance; use a reviewed forward migration."
  end
end
