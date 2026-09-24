class RecordAppointmentSeriesChanges < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_appointment_series_occurrences, :change_reason, :text
    add_check_constraint :clinic_appointment_series_occurrences,
      "change_reason IS NULL OR length(trim(change_reason)) BETWEEN 1 AND 500",
      name: "clinic_appointment_series_occurrence_change_reason"

    create_table :clinic_appointment_series_changes do |t|
      t.bigint :practice_id, null: false
      t.bigint :series_id, null: false
      t.bigint :written_by_membership_id, null: false
      t.string :action, null: false
      t.integer :from_sequence, null: false
      t.text :reason, null: false
      t.jsonb :before_visits, null: false, default: []
      t.jsonb :after_visits, null: false, default: []
      t.timestamps
    end
    add_index :clinic_appointment_series_changes, %i[practice_id series_id id]
    add_foreign_key :clinic_appointment_series_changes, :clinic_appointment_series,
      column: %i[practice_id series_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_appointment_series_changes, :clinic_memberships,
      column: %i[practice_id written_by_membership_id], primary_key: %i[practice_id id]
    add_check_constraint :clinic_appointment_series_changes,
      "action IN ('change_future', 'cancel_future') AND from_sequence BETWEEN 1 AND 12 " \
      "AND length(trim(reason)) BETWEEN 1 AND 500",
      name: "clinic_appointment_series_change_required_fields"
    execute <<~SQL
      CREATE TRIGGER clinic_appointment_series_changes_immutable
      BEFORE UPDATE OR DELETE ON clinic_appointment_series_changes
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Retain series change history; use a reviewed forward migration."
  end
end
