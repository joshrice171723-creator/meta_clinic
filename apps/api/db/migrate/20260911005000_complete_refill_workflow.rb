class CompleteRefillWorkflow < ActiveRecord::Migration[8.1]
  def change
    change_column_null :clinic_patient_portal_requests, :identity_id, true
    add_column :clinic_patient_portal_requests, :origin, :string
    add_reference :clinic_patient_portal_requests, :source_encounter, type: :bigint
    add_reference :clinic_patient_portal_requests, :medication_request_revision, type: :bigint

    reversible do |direction|
      direction.up do
        execute "UPDATE clinic_patient_portal_requests SET origin = 'patient' WHERE origin IS NULL"
      end
    end
    change_column_null :clinic_patient_portal_requests, :origin, false

    add_foreign_key :clinic_patient_portal_requests, :clinic_encounters,
      column: [ :practice_id, :source_encounter_id ], primary_key: [ :practice_id, :id ],
      name: "fk_refill_requests_source_encounter"
    add_foreign_key :clinic_patient_portal_requests, :clinic_medication_request_revisions,
      column: [ :practice_id, :medication_request_revision_id ], primary_key: [ :practice_id, :id ],
      name: "fk_refill_requests_medication_revision"
    add_check_constraint :clinic_patient_portal_requests,
      "origin IN ('patient', 'staff') AND (origin = 'staff' OR identity_id IS NOT NULL)",
      name: "clinic_patient_portal_requests_origin", validate: false
    add_check_constraint :clinic_patient_portal_requests,
      "request_type <> 'refill' OR status <> 'resolved' OR (source_encounter_id IS NOT NULL AND medication_request_revision_id IS NOT NULL)",
      name: "clinic_refill_requests_resolved_revision", validate: false

    create_table :clinic_refill_response_deliveries do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :request_id, null: false
      t.string :channel, null: false, default: "portal"
      t.string :state, null: false, default: "pending"
      t.integer :attempt_count, null: false, default: 0
      t.datetime :last_attempted_at
      t.datetime :delivered_at
      t.string :failure_code
      t.timestamps
    end
    add_index :clinic_refill_response_deliveries, [ :practice_id, :request_id ], unique: true,
      name: "clinic_refill_response_deliveries_request"
    add_index :clinic_refill_response_deliveries, [ :practice_id, :state, :updated_at ],
      name: "clinic_refill_response_deliveries_recovery"
    add_foreign_key :clinic_refill_response_deliveries, :clinic_practices, column: :practice_id,
      name: "fk_refill_response_deliveries_practice"
    add_foreign_key :clinic_refill_response_deliveries, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_refill_response_deliveries_patient"
    add_foreign_key :clinic_refill_response_deliveries, :clinic_patient_portal_requests,
      column: [ :practice_id, :request_id ], primary_key: [ :practice_id, :id ],
      name: "fk_refill_response_deliveries_request"
    add_check_constraint :clinic_refill_response_deliveries,
      "channel = 'portal' AND state IN ('pending', 'delivered', 'failed', 'retry_pending') AND attempt_count >= 0",
      name: "clinic_refill_response_deliveries_state"
    add_check_constraint :clinic_refill_response_deliveries,
      "(state = 'delivered' AND delivered_at IS NOT NULL AND failure_code IS NULL) OR (state <> 'delivered' AND delivered_at IS NULL)",
      name: "clinic_refill_response_deliveries_outcome"
  end
end
