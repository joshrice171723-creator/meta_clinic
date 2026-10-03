class AddClinicInsurancePreparation < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_coverage_versions, :coverage_details, :text
    add_column :clinic_coverage_versions, :site_id, :bigint
    add_column :clinic_coverage_versions, :recorded_by_id, :bigint
    add_foreign_key :clinic_coverage_versions, :clinic_sites, column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "coverage_preparation_site_fk"
    add_foreign_key :clinic_coverage_versions, :users, column: :recorded_by_id

    create_table :clinic_insurance_workflow_events do |t|
      t.bigint :practice_id, :patient_id, :site_id, :coverage_version_id, :recorded_by_id, null: false
      t.bigint :invoice_id, :insurance_claim_id, :request_event_id, :prior_event_id
      t.string :kind, :state, :source, :request_key, null: false
      t.text :details, null: false
      t.timestamps
    end
    add_index :clinic_insurance_workflow_events, %i[practice_id patient_id id], unique: true, name: "insurance_events_patient_identity"
    add_index :clinic_insurance_workflow_events, %i[practice_id recorded_by_id request_key], unique: true, name: "insurance_events_request_identity"
    add_index :clinic_insurance_workflow_events, %i[request_event_id id]
    add_index :clinic_insurance_workflow_events, :prior_event_id, unique: true, where: "prior_event_id IS NOT NULL"
    add_foreign_key :clinic_insurance_workflow_events, :clinic_patients, column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "insurance_events_patient_fk"
    add_foreign_key :clinic_insurance_workflow_events, :clinic_sites, column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "insurance_events_site_fk"
    add_foreign_key :clinic_insurance_workflow_events, :clinic_coverage_versions, column: %i[practice_id patient_id coverage_version_id], primary_key: %i[practice_id patient_id id], name: "insurance_events_coverage_fk"
    add_foreign_key :clinic_insurance_workflow_events, :clinic_invoices, column: %i[practice_id patient_id invoice_id], primary_key: %i[practice_id patient_id id], name: "insurance_events_invoice_fk"
    add_foreign_key :clinic_insurance_workflow_events, :clinic_insurance_claims, column: :insurance_claim_id
    add_foreign_key :clinic_insurance_workflow_events, :users, column: :recorded_by_id
    %i[request_event_id prior_event_id].each do |field|
      add_foreign_key :clinic_insurance_workflow_events, :clinic_insurance_workflow_events, column: [ :practice_id, :patient_id, field ], primary_key: %i[practice_id patient_id id], name: "insurance_events_#{field}_fk"
    end
    add_check_constraint :clinic_insurance_workflow_events,
      "kind IN ('eligibility', 'authorization', 'claim', 'reconciliation') AND state IN ('prepared', 'pending', 'approved', 'denied', 'unknown', 'cancelled') AND source IN ('local', 'manual', 'simulation') AND ((request_event_id IS NULL AND prior_event_id IS NULL AND state = 'prepared' AND source = 'local') OR (request_event_id IS NOT NULL AND prior_event_id IS NOT NULL AND state <> 'prepared' AND source <> 'local')) AND (kind NOT IN ('claim', 'reconciliation') OR invoice_id IS NOT NULL)", name: "insurance_events_state_contract"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION clinic_insurance_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'Insurance preparation history is append-only';
          END;
          $$;
        SQL
        execute "CREATE TRIGGER clinic_insurance_events_immutable BEFORE UPDATE OR DELETE ON clinic_insurance_workflow_events FOR EACH ROW EXECUTE FUNCTION clinic_insurance_event_immutable()"
        execute "CREATE TRIGGER clinic_insurance_events_no_truncate BEFORE TRUNCATE ON clinic_insurance_workflow_events FOR EACH STATEMENT EXECUTE FUNCTION clinic_insurance_event_immutable()"
      end
      direction.down do
        execute "DROP TRIGGER clinic_insurance_events_no_truncate ON clinic_insurance_workflow_events"
        execute "DROP TRIGGER clinic_insurance_events_immutable ON clinic_insurance_workflow_events"
        execute "DROP FUNCTION clinic_insurance_event_immutable()"
      end
    end
  end
end
