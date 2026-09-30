class AddDurablePrescriptionPreparations < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_prescription_preparations do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :medication_request_revision_id, null: false
      t.bigint :pharmacy_destination_id, null: false
      t.bigint :review_event_id, null: false
      t.bigint :prepared_by_membership_id, null: false
      t.string :request_key, null: false
      t.string :schema_version, null: false
      t.string :payload_digest, null: false
      t.string :mode, null: false
      t.jsonb :destination_snapshot, null: false
      t.jsonb :signer_snapshot, null: false
      t.jsonb :reviewer_snapshot, null: false
      t.datetime :prepared_at, null: false
    end
    add_index :clinic_prescription_preparations, %i[practice_id request_key], unique: true, name: "prescription_preparation_request"
    add_index :clinic_prescription_preparations, %i[practice_id id], unique: true, name: "prescription_preparation_tenant"
    add_index :clinic_prescription_preparations, %i[practice_id medication_request_revision_id], name: "prescription_preparation_order"
    add_foreign_key :clinic_prescription_preparations, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_prescription_preparations, :clinic_patients, column: :patient_id
    add_foreign_key :clinic_prescription_preparations, :clinic_prescription_events, column: :review_event_id
    add_foreign_key :clinic_prescription_preparations, :clinic_medication_request_revisions,
      column: %i[practice_id medication_request_revision_id], primary_key: %i[practice_id id], name: "prescription_preparation_order_tenant"
    add_foreign_key :clinic_prescription_preparations, :clinic_pharmacy_destinations,
      column: %i[practice_id pharmacy_destination_id], primary_key: %i[practice_id id], name: "prescription_preparation_destination_tenant"
    add_foreign_key :clinic_prescription_preparations, :clinic_memberships,
      column: %i[practice_id prepared_by_membership_id], primary_key: %i[practice_id id], name: "prescription_preparation_actor_tenant"
    add_check_constraint :clinic_prescription_preparations,
      "schema_version = 'local-simulation-v1' AND payload_digest ~ '^[0-9a-f]{64}$' AND " \
      "mode IN ('standard','controlled_test') AND length(trim(request_key)) BETWEEN 1 AND 100 AND " \
      "jsonb_typeof(destination_snapshot) = 'object' AND jsonb_typeof(signer_snapshot) = 'object' AND jsonb_typeof(reviewer_snapshot) = 'object'",
      name: "prescription_preparation_values"
    # Existing attempts keep NULL: do not fabricate historical preparation evidence.
    add_column :clinic_prescription_transmission_attempts, :preparation_id, :bigint
    add_index :clinic_prescription_transmission_attempts, :preparation_id, unique: true, name: "prescription_attempt_preparation"
    add_foreign_key :clinic_prescription_transmission_attempts, :clinic_prescription_preparations,
      column: %i[practice_id preparation_id], primary_key: %i[practice_id id], name: "prescription_attempt_preparation_tenant"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION prescription_preparation_context() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM clinic_medication_request_revisions r
              JOIN clinic_prescription_events e ON e.id = NEW.review_event_id
              WHERE r.id = NEW.medication_request_revision_id AND r.practice_id = NEW.practice_id
                AND r.patient_id = NEW.patient_id AND e.practice_id = NEW.practice_id
                AND e.patient_id = NEW.patient_id AND e.medication_request_revision_id = r.id
                AND e.kind = 'review' AND e.source = 'manual'
            ) THEN RAISE EXCEPTION 'Preparation requires an exact prescription review'; END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER prescription_preparation_context BEFORE INSERT ON clinic_prescription_preparations
            FOR EACH ROW EXECUTE FUNCTION prescription_preparation_context();
          CREATE TRIGGER prescription_preparations_immutable BEFORE UPDATE OR DELETE ON clinic_prescription_preparations
            FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
          CREATE FUNCTION prescription_attempt_preparation_context() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.preparation_id IS NULL OR NOT EXISTS (
              SELECT 1 FROM clinic_prescription_preparations p
              WHERE p.id = NEW.preparation_id AND p.practice_id = NEW.practice_id AND p.patient_id = NEW.patient_id
                AND p.medication_request_revision_id = NEW.medication_request_revision_id
                AND p.pharmacy_destination_id = NEW.pharmacy_destination_id AND p.review_event_id = NEW.review_event_id
                AND p.schema_version = NEW.schema_version AND p.payload_digest = NEW.payload_digest AND p.mode = NEW.mode
                AND p.destination_snapshot = NEW.destination_snapshot AND p.signer_snapshot = NEW.signer_snapshot
                AND p.reviewer_snapshot = NEW.reviewer_snapshot AND p.prepared_at <= NEW.submitted_at
            ) THEN RAISE EXCEPTION 'Submission requires matching durable preparation'; END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER prescription_attempt_preparation_context BEFORE INSERT ON clinic_prescription_transmission_attempts
            FOR EACH ROW EXECUTE FUNCTION prescription_attempt_preparation_context();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER prescription_attempt_preparation_context ON clinic_prescription_transmission_attempts"
        execute "DROP FUNCTION prescription_attempt_preparation_context()"
        execute "DROP TRIGGER prescription_preparation_context ON clinic_prescription_preparations"
        execute "DROP TRIGGER prescription_preparations_immutable ON clinic_prescription_preparations"
        execute "DROP FUNCTION prescription_preparation_context()"
      end
    end
  end
end
