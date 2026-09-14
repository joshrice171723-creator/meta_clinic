class AddPrescriptionPreparationAndAttempts < ActiveRecord::Migration[8.1]
  def change
    change_table :clinic_medication_request_revisions do |t|
      %i[fulfillment_route medication_strength medication_form medication_code_system medication_code medication_code_version catalog_source pharmacy_name pharmacy_location pharmacy_identifier quantity_unit duration_text].each { |name| t.text name }
      t.decimal :prescribed_quantity, precision: 18, scale: 6
      t.integer :refills
      t.date :starts_on
    end
    create_table :clinic_prescription_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :medication_request_revision_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.bigint :prior_event_id
      t.string :kind, null: false
      t.string :source, null: false
      t.string :request_key, null: false
      t.text :note
      t.datetime :recorded_at, null: false
    end
    add_index :clinic_prescription_events, %i[practice_id request_key], unique: true
    add_foreign_key :clinic_prescription_events, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_prescription_events, :clinic_patients, column: :patient_id
    add_foreign_key :clinic_prescription_events, :clinic_medication_request_revisions, column: :medication_request_revision_id
    add_foreign_key :clinic_prescription_events, :clinic_memberships, column: :recorded_by_membership_id
    add_foreign_key :clinic_prescription_events, :clinic_prescription_events, column: :prior_event_id
    add_check_constraint :clinic_prescription_events, "source IN ('manual', 'simulation')", name: "prescription_event_source"
    add_foreign_key :clinic_prescription_events, :clinic_medication_request_revisions,
      column: %i[practice_id medication_request_revision_id], primary_key: %i[practice_id id], name: "prescription_event_order_tenant"
    add_foreign_key :clinic_prescription_events, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id], name: "prescription_event_actor_tenant"
    add_check_constraint :clinic_prescription_events,
      "kind IN ('review','failure_before_send','rejected','acknowledged','unknown','cancelled','confirmed_not_sent')",
      name: "prescription_event_kind"
    reversible do |direction|
      direction.up { execute "CREATE TRIGGER prescription_events_immutable BEFORE UPDATE OR DELETE ON clinic_prescription_events FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()" }
      direction.down { execute "DROP TRIGGER prescription_events_immutable ON clinic_prescription_events" }
    end
  end
end
