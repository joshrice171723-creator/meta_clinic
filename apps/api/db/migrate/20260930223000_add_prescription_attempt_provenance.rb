class AddPrescriptionAttemptProvenance < ActiveRecord::Migration[8.1]
  def change
    change_table :clinic_prescription_transmission_attempts do |t|
      t.string :source
      t.string :transaction_type
      t.string :schema_version
      t.string :payload_digest
      t.uuid :correlation_id
      t.bigint :review_event_id
      t.bigint :prior_attempt_id
    end
    add_index :clinic_prescription_transmission_attempts, :correlation_id, unique: true,
      name: "prescription_attempt_correlation"
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_prescription_events, column: :review_event_id
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_prescription_transmission_attempts, column: :prior_attempt_id
    add_check_constraint :clinic_prescription_transmission_attempts,
      "(source IS NULL AND transaction_type IS NULL AND schema_version IS NULL AND payload_digest IS NULL AND " \
      "correlation_id IS NULL AND review_event_id IS NULL AND prior_attempt_id IS NULL) OR " \
      "(source IS NOT NULL AND source = 'simulation' AND transaction_type IS NOT NULL AND transaction_type = 'NewRx' AND " \
      "schema_version IS NOT NULL AND schema_version = 'local-simulation-v1' AND payload_digest IS NOT NULL AND " \
      "payload_digest ~ '^[0-9a-f]{64}$' AND correlation_id IS NOT NULL AND review_event_id IS NOT NULL)",
      name: "prescription_attempt_provenance_values"
  end
end
