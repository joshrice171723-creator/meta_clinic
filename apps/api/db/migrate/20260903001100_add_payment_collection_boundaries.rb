class AddPaymentCollectionBoundaries < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_payment_collection_intents do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :invoice_id, null: false
      t.string :reference, null: false
      t.string :request_key, null: false
      t.string :processor, null: false
      t.string :mode, null: false, default: "test"
      t.string :currency, null: false
      t.decimal :amount, precision: 20, scale: 6, null: false
      t.string :state, null: false, default: "pending"
      t.timestamps
    end

    add_index :clinic_payment_collection_intents, [ :practice_id, :id ], unique: true,
      name: "clinic_payment_collection_intents_practice_id"
    add_index :clinic_payment_collection_intents, [ :practice_id, :reference ], unique: true,
      name: "clinic_payment_collection_intents_reference"
    add_index :clinic_payment_collection_intents, [ :practice_id, :request_key ], unique: true,
      name: "clinic_payment_collection_intents_request_key"
    add_index :clinic_payment_collection_intents, [ :practice_id, :invoice_id ]
    add_foreign_key :clinic_payment_collection_intents, :clinic_practices,
      column: :practice_id, name: "fk_payment_collection_intents_practice"
    add_foreign_key :clinic_payment_collection_intents, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_payment_collection_intents_patient"
    add_foreign_key :clinic_payment_collection_intents, :clinic_invoices,
      column: [ :practice_id, :patient_id, :invoice_id ], primary_key: [ :practice_id, :patient_id, :id ],
      name: "fk_payment_collection_intents_invoice"
    add_check_constraint :clinic_payment_collection_intents, <<~SQL.squish, name: "payment_collection_intents_values"
      reference ~ '^ci_[a-f0-9]{32}$'
      AND request_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$'
      AND processor ~ '^[a-z][a-z0-9_.-]{0,39}$'
      AND mode IN ('test', 'live')
      AND currency ~ '^[A-Z]{3}$'
      AND amount > 0
      AND state IN ('pending', 'processing', 'succeeded', 'failed', 'needs_reconciliation', 'canceled')
    SQL

    create_table :clinic_payment_processor_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id
      t.bigint :payment_collection_intent_id
      t.string :processor, null: false
      t.string :processor_event_reference, null: false
      t.string :processor_intent_reference
      t.string :event_type, null: false
      t.string :payload_version
      t.string :raw_payload_digest, null: false
      t.string :normalized_outcome, null: false
      t.string :processing_state, null: false
      t.datetime :verified_at, null: false
      t.jsonb :redacted_payload, null: false, default: {}
      t.timestamps
    end

    add_index :clinic_payment_processor_events, [ :practice_id, :id ], unique: true,
      name: "clinic_payment_processor_events_practice_id"
    add_index :clinic_payment_processor_events, [ :practice_id, :processor, :processor_event_reference ], unique: true,
      name: "clinic_payment_processor_events_identity"
    add_index :clinic_payment_processor_events, [ :practice_id, :payment_collection_intent_id ]
    add_foreign_key :clinic_payment_processor_events, :clinic_practices,
      column: :practice_id, name: "fk_payment_processor_events_practice"
    add_foreign_key :clinic_payment_processor_events, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_payment_processor_events_patient"
    add_foreign_key :clinic_payment_processor_events, :clinic_payment_collection_intents,
      column: [ :practice_id, :payment_collection_intent_id ],
      primary_key: [ :practice_id, :id ], name: "fk_payment_processor_events_intent"
    add_check_constraint :clinic_payment_processor_events, <<~SQL.squish, name: "payment_processor_events_values"
      processor ~ '^[a-z][a-z0-9_.-]{0,39}$'
      AND length(trim(processor_event_reference)) > 0
      AND length(trim(event_type)) > 0
      AND raw_payload_digest ~ '^[0-9a-f]{64}$'
      AND normalized_outcome IN ('succeeded', 'failed', 'processing', 'canceled', 'unknown')
      AND processing_state IN ('received', 'signature_verified', 'normalized', 'applied', 'ignored_duplicate', 'rejected', 'needs_reconciliation')
      AND redacted_payload IS NOT NULL
    SQL
  end
end
