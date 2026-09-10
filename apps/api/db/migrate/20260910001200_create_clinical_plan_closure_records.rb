class CreateClinicalPlanClosureRecords < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_medication_administrations, %i[practice_id patient_id encounter_id id], unique: true,
      name: "clinic_med_admin_context_id"

    create_revision_table(:clinic_immunization_revisions, "immunization") do |t|
      t.text :vaccine_name, null: false
      t.text :cvx_code
      t.text :manufacturer
      t.text :lot_number
      t.text :dose_text
      t.text :route_text
      t.text :administration_site_text
      t.column :administered_at, "timestamp(6) with time zone"
      t.string :occurrence_source, null: false, limit: 32
      t.text :refusal_reason
      t.bigint :source_document_id
    end
    add_check_constraint :clinic_immunization_revisions,
      "status IN ('planned','completed','not_done','entered_in_error') AND " \
      "occurrence_source IN ('administered_here','patient_reported','external_record','registry') AND " \
      "(status <> 'completed' OR administered_at IS NOT NULL) AND " \
      "(status <> 'not_done' OR refusal_reason IS NOT NULL)",
      name: "clinic_immunization_states"
    add_foreign_key :clinic_immunization_revisions, :clinic_documents,
      column: %i[practice_id patient_id source_document_id],
      primary_key: %i[practice_id patient_id id], name: "fk_immunization_source_document"

    create_table :clinic_clinical_plan_links do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.string :source_kind, null: false, limit: 32
      t.bigint :medication_request_revision_id
      t.bigint :service_request_revision_id
      t.string :target_kind, null: false, limit: 32
      t.bigint :medication_statement_id
      t.bigint :medication_administration_id
      t.bigint :lab_report_id
      t.bigint :procedure_revision_id
      t.bigint :document_id
      t.text :outcome_summary
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.timestamps
    end
    add_index :clinic_clinical_plan_links, %i[practice_id id], unique: true, name: "clinical_plan_links_practice_id"
    add_index :clinic_clinical_plan_links, %i[practice_id encounter_id recorded_at id],
      name: "clinical_plan_links_encounter_timeline"
    add_index :clinic_clinical_plan_links, %i[practice_id recorded_by_membership_id request_key], unique: true,
      name: "clinical_plan_links_request_key"
    add_index :clinic_clinical_plan_links,
      %i[practice_id source_kind medication_request_revision_id service_request_revision_id target_kind
        medication_statement_id medication_administration_id lab_report_id procedure_revision_id document_id],
      unique: true, name: "clinical_plan_links_identity"
    add_context_foreign_keys(:clinic_clinical_plan_links, "clinical_plan_link")
    add_foreign_key :clinic_clinical_plan_links, :clinic_medication_request_revisions,
      column: %i[practice_id patient_id encounter_id medication_request_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_plan_link_med_request"
    add_foreign_key :clinic_clinical_plan_links, :clinic_service_request_revisions,
      column: %i[practice_id patient_id encounter_id service_request_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_plan_link_service_request"
    add_foreign_key :clinic_clinical_plan_links, :clinic_medication_statements,
      column: %i[practice_id patient_id medication_statement_id],
      primary_key: %i[practice_id patient_id id], name: "fk_plan_link_med_statement"
    add_foreign_key :clinic_clinical_plan_links, :clinic_medication_administrations,
      column: %i[practice_id patient_id encounter_id medication_administration_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_plan_link_med_admin"
    add_foreign_key :clinic_clinical_plan_links, :clinic_lab_reports,
      column: %i[practice_id patient_id lab_report_id],
      primary_key: %i[practice_id patient_id id], name: "fk_plan_link_lab_report"
    add_foreign_key :clinic_clinical_plan_links, :clinic_procedure_revisions,
      column: %i[practice_id patient_id encounter_id procedure_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_plan_link_procedure"
    add_foreign_key :clinic_clinical_plan_links, :clinic_documents,
      column: %i[practice_id patient_id document_id],
      primary_key: %i[practice_id patient_id id], name: "fk_plan_link_document"
    add_check_constraint :clinic_clinical_plan_links, <<~SQL.squish,
      source_kind IN ('medication_request','service_request')
      AND num_nonnulls(medication_request_revision_id, service_request_revision_id) = 1
      AND num_nonnulls(medication_statement_id, medication_administration_id, lab_report_id,
        procedure_revision_id, document_id) = 1
      AND (
        (source_kind = 'medication_request' AND medication_request_revision_id IS NOT NULL
          AND target_kind IN ('medication_statement','medication_administration'))
        OR
        (source_kind = 'service_request' AND service_request_revision_id IS NOT NULL
          AND target_kind IN ('lab_report','procedure','document'))
      )
      AND (outcome_summary IS NULL OR char_length(trim(outcome_summary)) BETWEEN 1 AND 2000)
      AND char_length(request_key) BETWEEN 1 AND 160
    SQL
      name: "clinical_plan_links_shape"

    create_table :clinic_referral_exchange_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.bigint :service_request_revision_id, null: false
      t.uuid :service_request_series_id, null: false
      t.string :direction, null: false, limit: 16
      t.string :stage, null: false, limit: 24
      t.text :organization_name
      t.text :note
      t.bigint :document_id
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.timestamps
    end
    add_index :clinic_referral_exchange_events, %i[practice_id id], unique: true,
      name: "referral_exchange_events_practice_id"
    add_index :clinic_referral_exchange_events, %i[practice_id service_request_series_id recorded_at id],
      name: "referral_exchange_events_timeline"
    add_index :clinic_referral_exchange_events, %i[practice_id recorded_by_membership_id request_key], unique: true,
      name: "referral_exchange_events_request_key"
    add_context_foreign_keys(:clinic_referral_exchange_events, "referral_exchange")
    add_foreign_key :clinic_referral_exchange_events, :clinic_service_request_revisions,
      column: %i[practice_id patient_id encounter_id service_request_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_referral_exchange_request"
    add_foreign_key :clinic_referral_exchange_events, :clinic_documents,
      column: %i[practice_id patient_id document_id],
      primary_key: %i[practice_id patient_id id], name: "fk_referral_exchange_document"
    add_check_constraint :clinic_referral_exchange_events,
      "direction IN ('outbound','inbound') AND " \
      "stage IN ('prepared','sent','received','acknowledged','closed','cancelled') AND " \
      "(organization_name IS NULL OR char_length(trim(organization_name)) BETWEEN 1 AND 500) AND " \
      "(note IS NULL OR char_length(trim(note)) BETWEEN 1 AND 2000) AND " \
      "char_length(request_key) BETWEEN 1 AND 160",
      name: "referral_exchange_events_values"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION clinic_clinical_linkage_protect() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'Clinical linkage evidence is immutable';
          END;
          $$;
        SQL
        %w[clinic_clinical_plan_links clinic_referral_exchange_events].each do |table|
          execute <<~SQL
            CREATE TRIGGER #{table}_protect
            BEFORE UPDATE OR DELETE ON #{table}
            FOR EACH ROW EXECUTE FUNCTION clinic_clinical_linkage_protect();
          SQL
        end
        execute <<~SQL
          CREATE TRIGGER clinic_immunization_revisions_protect
          BEFORE UPDATE OR DELETE ON clinic_immunization_revisions
          FOR EACH ROW EXECUTE FUNCTION clinic_clinical_revision_protect();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_immunization_revisions_protect ON clinic_immunization_revisions"
        execute "DROP FUNCTION IF EXISTS clinic_clinical_linkage_protect() CASCADE"
      end
    end
  end

  private

  def create_revision_table(table, prefix)
    create_table table do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.uuid :series_id, null: false, default: -> { "gen_random_uuid()" }
      t.integer :version_number, null: false
      t.bigint :prior_revision_id
      t.string :status, null: false, limit: 32
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.string :content_digest, null: false, limit: 64
      yield t
      t.timestamps
    end
    add_index table, %i[practice_id id], unique: true, name: "#{prefix}_practice_id"
    add_index table, %i[practice_id patient_id encounter_id id], unique: true, name: "#{prefix}_context_id"
    add_index table, %i[practice_id encounter_id series_id version_number], unique: true,
      name: "#{prefix}_series_version"
    add_index table, %i[practice_id recorded_by_membership_id request_key], unique: true,
      name: "#{prefix}_request_key"
    add_context_foreign_keys(table, prefix)
    add_foreign_key table, table,
      column: %i[practice_id patient_id encounter_id prior_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_#{prefix}_prior_revision"
    add_check_constraint table,
      "version_number > 0 AND length(content_digest) = 64 AND length(request_key) BETWEEN 1 AND 160",
      name: "#{prefix}_revision_values"
  end

  def add_context_foreign_keys(table, prefix)
    add_foreign_key table, :clinic_practices, column: :practice_id, name: "fk_#{prefix}_practice"
    add_foreign_key table, :clinic_patients, column: %i[practice_id patient_id],
      primary_key: %i[practice_id id], name: "fk_#{prefix}_patient"
    add_foreign_key table, :clinic_encounters,
      column: %i[practice_id patient_id site_id encounter_id],
      primary_key: %i[practice_id patient_id site_id id], name: "fk_#{prefix}_encounter_site"
    add_foreign_key table, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_#{prefix}_recorder"
  end
end
