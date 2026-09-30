class AddPrescriptionResponseLifecycleEvidence < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_prescription_transmission_attempts, %i[practice_id id], unique: true, name: "prescription_attempt_tenant_key"
    create_table :clinic_prescription_lifecycle_requests do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :medication_request_revision_id, null: false
      t.bigint :transmission_attempt_id, null: false
      t.bigint :requested_by_membership_id, null: false
      t.string :action, null: false
      t.string :request_key, null: false
      t.string :schema_version, null: false
      t.uuid :correlation_id, null: false
      t.uuid :attempt_correlation_id, null: false
      t.datetime :requested_at, null: false
    end
    add_index :clinic_prescription_lifecycle_requests, %i[practice_id id], unique: true, name: "prescription_lifecycle_tenant_key"
    add_index :clinic_prescription_lifecycle_requests, %i[practice_id request_key], unique: true, name: "prescription_lifecycle_request_key"
    add_index :clinic_prescription_lifecycle_requests, :correlation_id, unique: true, name: "prescription_lifecycle_correlation"
    add_index :clinic_prescription_lifecycle_requests, %i[practice_id transmission_attempt_id], name: "prescription_lifecycle_attempt"
    add_check_constraint :clinic_prescription_lifecycle_requests,
      "action IN ('cancel','fill_notice') AND schema_version = 'local-prescription-lifecycle-v1' AND " \
      "length(trim(request_key)) BETWEEN 1 AND 100", name: "prescription_lifecycle_values"
    create_table :clinic_prescription_response_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :medication_request_revision_id, null: false
      t.bigint :transmission_attempt_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.bigint :lifecycle_request_id
      t.bigint :resolution_event_id
      t.string :event_kind, null: false
      t.string :source, null: false
      t.string :source_identity, null: false
      t.string :source_message_id
      t.string :schema_version, null: false
      t.string :transaction_type, null: false
      t.string :outcome, null: false
      t.string :response_code
      t.text :response_text
      t.string :payload_digest, null: false
      t.uuid :attempt_correlation_id, null: false
      t.uuid :lifecycle_correlation_id
      t.string :request_key, null: false
      t.datetime :recorded_at, null: false
      t.datetime :received_at
    end
    add_index :clinic_prescription_response_events, %i[practice_id request_key], unique: true, name: "prescription_response_request_key"
    add_index :clinic_prescription_response_events, %i[practice_id source_identity source_message_id], unique: true,
      name: "prescription_response_message_key"
    add_index :clinic_prescription_response_events, %i[practice_id transmission_attempt_id], name: "prescription_response_attempt"
    add_index :clinic_prescription_response_events, :lifecycle_request_id, unique: true,
      where: "event_kind = 'received' AND lifecycle_request_id IS NOT NULL", name: "prescription_response_lifecycle_terminal"
    add_index :clinic_prescription_response_events, :transmission_attempt_id, unique: true,
      where: "event_kind = 'received' AND transaction_type = 'NewRx'", name: "prescription_response_newrx_terminal"
    add_foreign_key :clinic_prescription_response_events, :clinic_prescription_lifecycle_requests,
      column: %i[practice_id lifecycle_request_id], primary_key: %i[practice_id id], name: "prescription_response_lifecycle_tenant"
    add_foreign_key :clinic_prescription_response_events, :clinic_prescription_events, column: :resolution_event_id
    [ :clinic_prescription_lifecycle_requests, :clinic_prescription_response_events ].each do |table|
      add_foreign_key table, :clinic_practices, column: :practice_id
      add_foreign_key table, :clinic_patients, column: :patient_id
      add_foreign_key table, :clinic_medication_request_revisions,
        column: %i[practice_id medication_request_revision_id], primary_key: %i[practice_id id], name: "#{table.to_s.delete_prefix('clinic_')}_order"
      add_foreign_key table, :clinic_prescription_transmission_attempts,
        column: %i[practice_id transmission_attempt_id], primary_key: %i[practice_id id], name: "#{table.to_s.delete_prefix('clinic_')}_attempt_fk"
      actor = table == :clinic_prescription_lifecycle_requests ? :requested_by_membership_id : :recorded_by_membership_id
      add_foreign_key table, :clinic_memberships, column: [ :practice_id, actor ], primary_key: %i[practice_id id],
        name: "#{table.to_s.delete_prefix('clinic_')}_actor"
    end
    add_check_constraint :clinic_prescription_response_events,
      "source = 'simulation' AND source_identity = 'simulated_pharmacy_network' AND schema_version = 'local-prescription-response-v1' AND " \
      "payload_digest ~ '^[0-9a-f]{64}$' AND length(trim(request_key)) BETWEEN 1 AND 160 AND " \
      "((event_kind = 'received' AND received_at IS NOT NULL AND source_message_id IS NOT NULL AND response_code IS NOT NULL AND response_text IS NOT NULL AND " \
      "response_code = 'local_simulation.' || transaction_type || '.' || outcome AND length(response_text) BETWEEN 1 AND 2000) OR " \
      "(event_kind = 'local_outcome' AND outcome IN ('unknown','unavailable') AND received_at IS NULL AND source_message_id IS NULL AND response_code IS NULL AND response_text IS NULL)) AND " \
      "((transaction_type = 'NewRx' AND outcome IN ('acknowledged','accepted','rejected','duplicate') AND event_kind = 'received' AND lifecycle_request_id IS NULL AND lifecycle_correlation_id IS NULL) OR " \
      "(transaction_type = 'CancelRx' AND outcome IN ('cancellation_acknowledged','cancellation_rejected','unknown','unavailable') AND lifecycle_request_id IS NOT NULL AND lifecycle_correlation_id IS NOT NULL) OR " \
      "(transaction_type = 'RxFill' AND outcome IN ('fill_notice','unknown','unavailable') AND lifecycle_request_id IS NOT NULL AND lifecycle_correlation_id IS NOT NULL)) AND " \
      "((outcome = 'cancellation_acknowledged' AND resolution_event_id IS NOT NULL AND event_kind = 'received') OR " \
      "(outcome <> 'cancellation_acknowledged' AND resolution_event_id IS NULL)) AND " \
      "(outcome NOT IN ('unknown','unavailable') OR event_kind = 'local_outcome')",
      name: "prescription_response_values"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION prescription_lifecycle_context() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM clinic_prescription_transmission_attempts a
              WHERE a.id = NEW.transmission_attempt_id AND a.practice_id = NEW.practice_id
                AND a.patient_id = NEW.patient_id AND a.medication_request_revision_id = NEW.medication_request_revision_id
                AND a.source = 'simulation' AND a.correlation_id = NEW.attempt_correlation_id
            ) THEN RAISE EXCEPTION 'Lifecycle evidence requires original simulated attempt identity'; END IF;
            RETURN NEW;
          END $$;
          CREATE FUNCTION prescription_response_context() RETURNS trigger LANGUAGE plpgsql AS $$
          DECLARE original_event_id bigint;
          BEGIN
            SELECT a.prescription_event_id INTO original_event_id FROM clinic_prescription_transmission_attempts a
              WHERE a.id = NEW.transmission_attempt_id AND a.practice_id = NEW.practice_id AND a.patient_id = NEW.patient_id
                AND a.medication_request_revision_id = NEW.medication_request_revision_id AND a.source = 'simulation'
                AND a.correlation_id = NEW.attempt_correlation_id;
            IF original_event_id IS NULL THEN RAISE EXCEPTION 'Response requires original simulated attempt identity'; END IF;
            IF NEW.lifecycle_request_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM clinic_prescription_lifecycle_requests r WHERE r.id = NEW.lifecycle_request_id
                AND r.practice_id = NEW.practice_id AND r.patient_id = NEW.patient_id
                AND r.transmission_attempt_id = NEW.transmission_attempt_id
                AND r.medication_request_revision_id = NEW.medication_request_revision_id
                AND r.attempt_correlation_id = NEW.attempt_correlation_id AND r.correlation_id = NEW.lifecycle_correlation_id
                AND r.action = CASE NEW.transaction_type WHEN 'CancelRx' THEN 'cancel' WHEN 'RxFill' THEN 'fill_notice' END
            ) THEN RAISE EXCEPTION 'Response requires exact original lifecycle request'; END IF;
            IF NEW.resolution_event_id IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM clinic_prescription_events e WHERE e.id = NEW.resolution_event_id
                AND e.practice_id = NEW.practice_id AND e.patient_id = NEW.patient_id
                AND e.medication_request_revision_id = NEW.medication_request_revision_id
                AND e.prior_event_id = original_event_id AND e.kind = 'cancelled' AND e.source = 'simulation'
                AND e.recorded_by_membership_id = NEW.recorded_by_membership_id
                AND e.request_key = 'prescription-response:' || NEW.request_key
            ) THEN RAISE EXCEPTION 'Cancellation must retain the original simulated event chain'; END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER prescription_lifecycle_context BEFORE INSERT ON clinic_prescription_lifecycle_requests
            FOR EACH ROW EXECUTE FUNCTION prescription_lifecycle_context();
          CREATE TRIGGER prescription_response_context BEFORE INSERT ON clinic_prescription_response_events
            FOR EACH ROW EXECUTE FUNCTION prescription_response_context();
          CREATE TRIGGER prescription_lifecycle_immutable BEFORE UPDATE OR DELETE ON clinic_prescription_lifecycle_requests
            FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
          CREATE TRIGGER prescription_response_immutable BEFORE UPDATE OR DELETE ON clinic_prescription_response_events
            FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER prescription_response_context ON clinic_prescription_response_events"
        execute "DROP TRIGGER prescription_response_immutable ON clinic_prescription_response_events"
        execute "DROP TRIGGER prescription_lifecycle_context ON clinic_prescription_lifecycle_requests"
        execute "DROP TRIGGER prescription_lifecycle_immutable ON clinic_prescription_lifecycle_requests"
        execute "DROP FUNCTION prescription_response_context()"
        execute "DROP FUNCTION prescription_lifecycle_context()"
      end
    end
  end
end
