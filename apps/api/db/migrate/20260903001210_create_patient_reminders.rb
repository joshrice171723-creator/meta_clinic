class CreatePatientReminders < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_communication_endpoints do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :patient, null: false
      t.string :endpoint_type, null: false
      t.text :value, null: false
      t.string :value_digest, null: false
      t.string :label, null: false, default: "Primary"
      t.datetime :verified_at
      t.datetime :invalidated_at
      t.string :invalidation_reason
      t.timestamps
    end
    add_foreign_key :clinic_communication_endpoints, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_communication_endpoints_patient"
    add_index :clinic_communication_endpoints, [ :practice_id, :patient_id, :endpoint_type ],
      name: "clinic_communication_endpoints_patient_type"
    add_index :clinic_communication_endpoints, [ :practice_id, :patient_id, :value_digest ],
      unique: true, name: "clinic_communication_endpoints_identity"
    add_check_constraint :clinic_communication_endpoints,
      "endpoint_type IN ('portal', 'phone', 'email') AND length(trim(value_digest)) > 0",
      name: "clinic_communication_endpoints_values"

    create_table :clinic_communication_preferences do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :patient, null: false
      t.string :category, null: false
      t.string :channel, null: false
      t.string :setting, null: false, default: "not_set"
      t.time :quiet_hours_start
      t.time :quiet_hours_end
      t.string :timezone, null: false
      t.string :locale, null: false, default: "en-US"
      t.datetime :effective_at, null: false
      t.string :source, null: false, default: "patient"
      t.integer :version, null: false, default: 1
      t.timestamps
    end
    add_foreign_key :clinic_communication_preferences, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_communication_preferences_patient"
    add_index :clinic_communication_preferences, [ :practice_id, :patient_id, :category, :channel, :version ],
      unique: true, name: "clinic_communication_preferences_version"
    add_check_constraint :clinic_communication_preferences,
      "category IN ('operational', 'marketing') AND channel IN ('portal', 'sms', 'email') AND setting IN ('allowed', 'blocked', 'not_set') AND version > 0",
      name: "clinic_communication_preferences_values"

    create_table :clinic_patient_reminders do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :patient, null: false
      t.references :communication_endpoint, null: false
      t.string :source_type, null: false
      t.bigint :source_id, null: false
      t.string :source_version
      t.string :category, null: false
      t.string :channel, null: false
      t.string :safe_content_version, null: false, default: "appointment-v1"
      t.text :safe_preview, null: false
      t.datetime :scheduled_at, null: false
      t.string :timezone, null: false
      t.string :local_schedule_label, null: false
      t.string :status, null: false, default: "draft"
      t.string :priority, null: false, default: "normal"
      t.string :dedupe_key, null: false
      t.datetime :expires_at
      t.datetime :cancelled_at
      t.string :cancel_reason
      t.string :policy_decision_code
      t.string :policy_version
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_foreign_key :clinic_patient_reminders, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_reminders_patient"
    add_foreign_key :clinic_patient_reminders, :clinic_communication_endpoints,
      column: [ :practice_id, :communication_endpoint_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_reminders_endpoint"
    add_index :clinic_patient_reminders, [ :practice_id, :dedupe_key ], unique: true, name: "clinic_patient_reminders_dedupe"
    add_index :clinic_patient_reminders, [ :practice_id, :status, :scheduled_at ], name: "clinic_patient_reminders_worklist"
    add_check_constraint :clinic_patient_reminders,
      "category IN ('appointment', 'preparation', 'medication', 'follow_up') AND channel IN ('portal', 'sms', 'email') AND length(trim(dedupe_key)) > 0 AND lock_version >= 0",
      name: "clinic_patient_reminders_values"

    create_table :clinic_patient_reminder_outbox do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :reminder, null: false
      t.string :dispatch_state, null: false, default: "pending"
      t.string :idempotency_key, null: false
      t.datetime :available_at, null: false
      t.datetime :lease_until
      t.string :provider_message_id
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_foreign_key :clinic_patient_reminder_outbox, :clinic_patient_reminders,
      column: [ :practice_id, :reminder_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_reminder_outbox_reminder"
    add_index :clinic_patient_reminder_outbox, [ :practice_id, :reminder_id ], unique: true, name: "clinic_patient_reminder_outbox_identity"
    add_index :clinic_patient_reminder_outbox, [ :dispatch_state, :available_at ], name: "clinic_patient_reminder_outbox_queue"

    create_table :clinic_patient_reminder_delivery_attempts do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :reminder, null: false
      t.integer :attempt_number, null: false
      t.string :provider, null: false, default: "synthetic"
      t.string :idempotency_key, null: false
      t.string :status, null: false
      t.string :failure_class
      t.boolean :retryable, null: false, default: false
      t.string :provider_message_id
      t.string :masked_destination, null: false
      t.datetime :queued_at, null: false
      t.datetime :accepted_at
      t.datetime :completed_at
      t.timestamps
    end
    add_foreign_key :clinic_patient_reminder_delivery_attempts, :clinic_patient_reminders,
      column: [ :practice_id, :reminder_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_reminder_attempts_reminder"
    add_index :clinic_patient_reminder_delivery_attempts, [ :practice_id, :reminder_id, :attempt_number ],
      unique: true, name: "clinic_patient_reminder_attempts_number"

    create_table :clinic_patient_reminder_actions do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :reminder, null: false
      t.references :patient, null: false
      t.references :actor, null: false, foreign_key: { to_table: :users }
      t.string :request_key, null: false
      t.string :action_type, null: false
      t.string :outcome, null: false, default: "recorded"
      t.timestamps
    end
    add_foreign_key :clinic_patient_reminder_actions, :clinic_patient_reminders,
      column: [ :practice_id, :reminder_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_reminder_actions_reminder"
    add_foreign_key :clinic_patient_reminder_actions, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_patient_reminder_actions_patient"
    add_index :clinic_patient_reminder_actions, [ :practice_id, :request_key ], unique: true, name: "clinic_patient_reminder_actions_request"
    add_check_constraint :clinic_patient_reminder_actions,
      "action_type IN ('confirm', 'request_reschedule', 'request_help', 'dismiss') AND length(trim(request_key)) > 0",
      name: "clinic_patient_reminder_actions_values"
  end
end
