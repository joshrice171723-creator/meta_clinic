class AddPrescriptionTransmissionWorkflow < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_medication_request_revisions, :refill_of_series_id, :string, limit: 36
    add_index :clinic_medication_request_revisions, %i[practice_id refill_of_series_id],
      name: "medication_request_refill_series"

    create_table :clinic_pharmacy_destinations do |t|
      t.bigint :practice_id, null: false
      t.string :name, null: false
      t.string :address_line1, null: false
      t.string :address_line2
      t.string :city, null: false
      t.string :state_code, null: false, limit: 2
      t.string :postal_code, null: false
      t.string :phone_number
      t.string :pharmacy_identifier
      t.boolean :active, null: false, default: true
      t.timestamps
    end
    add_index :clinic_pharmacy_destinations, %i[practice_id name city state_code postal_code],
      name: "pharmacy_destination_lookup"
    add_index :clinic_pharmacy_destinations, %i[practice_id id], unique: true,
      name: "pharmacy_destination_tenant_key"
    add_index :clinic_pharmacy_destinations, %i[practice_id pharmacy_identifier], unique: true,
      where: "pharmacy_identifier IS NOT NULL", name: "pharmacy_destination_identifier"
    add_foreign_key :clinic_pharmacy_destinations, :clinic_practices, column: :practice_id
    add_check_constraint :clinic_pharmacy_destinations,
      "length(trim(name)) BETWEEN 1 AND 240 AND length(trim(address_line1)) BETWEEN 1 AND 240 AND " \
      "length(trim(city)) BETWEEN 1 AND 120 AND state_code ~ '^[A-Z]{2}$' AND " \
      "length(trim(postal_code)) BETWEEN 3 AND 16",
      name: "pharmacy_destination_values"

    create_table :clinic_prescription_transmission_attempts do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :medication_request_revision_id, null: false
      t.bigint :pharmacy_destination_id, null: false
      t.bigint :prescription_event_id, null: false
      t.bigint :initiated_by_membership_id, null: false
      t.string :request_key, null: false
      t.string :adapter, null: false
      t.string :outcome, null: false
      t.jsonb :destination_snapshot, null: false, default: {}
      t.datetime :submitted_at, null: false
    end
    add_index :clinic_prescription_transmission_attempts, %i[practice_id request_key], unique: true,
      name: "prescription_transmission_attempt_request"
    add_index :clinic_prescription_transmission_attempts,
      %i[practice_id medication_request_revision_id submitted_at], name: "prescription_transmission_attempt_order"
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_patients, column: :patient_id
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_medication_request_revisions,
      column: :medication_request_revision_id
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_pharmacy_destinations,
      column: :pharmacy_destination_id
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_prescription_events,
      column: :prescription_event_id
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_memberships,
      column: :initiated_by_membership_id
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_medication_request_revisions,
      column: %i[practice_id medication_request_revision_id], primary_key: %i[practice_id id],
      name: "prescription_transmission_order_tenant"
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_pharmacy_destinations,
      column: %i[practice_id pharmacy_destination_id], primary_key: %i[practice_id id],
      name: "prescription_transmission_destination_tenant"
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_memberships,
      column: %i[practice_id initiated_by_membership_id], primary_key: %i[practice_id id],
      name: "prescription_transmission_actor_tenant"
    add_check_constraint :clinic_prescription_transmission_attempts,
      "adapter = 'simulated_pharmacy_network' AND outcome IN ('failure_before_send','rejected','acknowledged','unknown') AND jsonb_typeof(destination_snapshot) = 'object'",
      name: "prescription_transmission_attempt_values"
    reversible do |direction|
      direction.up do
        execute "CREATE TRIGGER prescription_transmission_attempts_immutable BEFORE UPDATE OR DELETE ON clinic_prescription_transmission_attempts FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
      end
      direction.down { execute "DROP TRIGGER prescription_transmission_attempts_immutable ON clinic_prescription_transmission_attempts" }
    end
  end
end
