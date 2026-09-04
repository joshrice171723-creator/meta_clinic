class CreateClinicScribeWorkflow < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_scribe_encounters do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :site_id
      t.bigint :created_by_id, null: false
      t.string :status, null: false, default: "awaiting_consent"
      t.string :consent_status, null: false, default: "not_recorded"
      t.string :consent_policy_version
      t.string :consent_method
      t.datetime :consented_at
      t.datetime :consent_withdrawn_at
      t.string :retention_class, null: false, default: "standard"
      t.datetime :retention_expires_at
      t.datetime :deleted_at
      t.string :template_id, null: false, default: "documentation-summary"
      t.integer :template_version, null: false, default: 1
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_scribe_encounters, %i[practice_id id], unique: true, name: "clinic_scribe_encounters_practice_id"
    add_index :clinic_scribe_encounters, %i[practice_id status]
    add_foreign_key :clinic_scribe_encounters, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_encounters, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_scribe_encounters_patient"
    add_foreign_key :clinic_scribe_encounters, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "fk_scribe_encounters_site"
    add_foreign_key :clinic_scribe_encounters, :users, column: :created_by_id
    add_check_constraint :clinic_scribe_encounters,
      "status IN ('awaiting_consent', 'consented', 'source_ready', 'in_review', 'approved', 'exported', 'consent_declined', 'consent_withdrawn', 'deleted') AND consent_status IN ('not_recorded', 'accepted', 'declined', 'withdrawn') AND template_version > 0",
      name: "scribe_encounters_state"

    create_table :clinic_scribe_sources do |t|
      t.bigint :practice_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :imported_by_id, null: false
      t.string :source_type, null: false, default: "transcript"
      t.string :status, null: false, default: "ready"
      t.text :content, null: false
      t.string :content_digest, null: false
      t.jsonb :source_metadata, null: false, default: {}
      t.datetime :deleted_at
      t.timestamps
    end
    add_index :clinic_scribe_sources, %i[practice_id id], unique: true, name: "clinic_scribe_sources_practice_id"
    add_index :clinic_scribe_sources, %i[practice_id encounter_id id], unique: true, name: "clinic_scribe_sources_scope"
    add_index :clinic_scribe_sources, %i[practice_id encounter_id status]
    add_foreign_key :clinic_scribe_sources, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_sources, :clinic_scribe_encounters,
      column: %i[practice_id encounter_id], primary_key: %i[practice_id id], name: "fk_scribe_sources_encounter"
    add_foreign_key :clinic_scribe_sources, :users, column: :imported_by_id
    add_check_constraint :clinic_scribe_sources,
      "source_type = 'transcript' AND status IN ('ready', 'incomplete', 'pending_deletion', 'deleted') AND length(trim(content_digest)) = 64",
      name: "scribe_sources_values"

    create_table :clinic_scribe_source_segments do |t|
      t.bigint :practice_id, null: false
      t.bigint :source_id, null: false
      t.integer :sequence, null: false
      t.string :speaker, null: false, default: "unknown"
      t.string :status, null: false, default: "ready"
      t.bigint :start_ms, null: false, default: 0
      t.bigint :end_ms, null: false, default: 0
      t.text :content, null: false
      t.jsonb :quality_flags, null: false, default: {}
      t.timestamps
    end
    add_index :clinic_scribe_source_segments, %i[practice_id source_id sequence], unique: true, name: "scribe_source_segments_order"
    add_foreign_key :clinic_scribe_source_segments, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_source_segments, :clinic_scribe_sources,
      column: %i[practice_id source_id], primary_key: %i[practice_id id], name: "fk_scribe_segments_source"
    add_check_constraint :clinic_scribe_source_segments,
      "sequence > 0 AND start_ms >= 0 AND end_ms >= start_ms AND speaker IN ('patient', 'clinician', 'caregiver', 'unknown') AND status IN ('ready', 'deleted')",
      name: "scribe_source_segments_values"

    create_table :clinic_scribe_drafts do |t|
      t.bigint :practice_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :source_id, null: false
      t.bigint :parent_id
      t.bigint :created_by_id, null: false
      t.string :status, null: false, default: "draft"
      t.string :template_id, null: false
      t.integer :template_version, null: false
      t.string :provider, null: false
      t.string :model, null: false
      t.string :model_version, null: false
      t.string :prompt_digest, null: false
      t.string :input_digest, null: false
      t.string :output_digest, null: false
      t.jsonb :warnings, null: false, default: []
      t.bigint :approved_by_id
      t.datetime :approved_at
      t.string :export_state, null: false, default: "not_exported"
      t.datetime :deleted_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_scribe_drafts, %i[practice_id id], unique: true, name: "clinic_scribe_drafts_practice_id"
    add_index :clinic_scribe_drafts, %i[practice_id encounter_id id], unique: true, name: "clinic_scribe_drafts_scope"
    add_index :clinic_scribe_drafts, %i[practice_id encounter_id status]
    add_foreign_key :clinic_scribe_drafts, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_drafts, :clinic_scribe_encounters,
      column: %i[practice_id encounter_id], primary_key: %i[practice_id id], name: "fk_scribe_drafts_encounter"
    add_foreign_key :clinic_scribe_drafts, :clinic_scribe_sources,
      column: %i[practice_id source_id], primary_key: %i[practice_id id], name: "fk_scribe_drafts_source"
    add_foreign_key :clinic_scribe_drafts, :clinic_scribe_drafts,
      column: %i[practice_id parent_id], primary_key: %i[practice_id id], name: "fk_scribe_drafts_parent"
    add_foreign_key :clinic_scribe_drafts, :users, column: :created_by_id
    add_foreign_key :clinic_scribe_drafts, :users, column: :approved_by_id
    add_check_constraint :clinic_scribe_drafts,
      "status IN ('draft', 'in_review', 'approved', 'superseded', 'exported', 'deleted') AND export_state IN ('not_exported', 'exported') AND template_version > 0",
      name: "scribe_drafts_state"

    create_table :clinic_scribe_draft_sections do |t|
      t.bigint :practice_id, null: false
      t.bigint :draft_id, null: false
      t.string :section_key, null: false
      t.text :generated_content
      t.text :human_content
      t.string :status, null: false, default: "needs_review"
      t.jsonb :warning_codes, null: false, default: []
      t.jsonb :evidence_segment_ids, null: false, default: []
      t.integer :edit_revision, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_scribe_draft_sections, %i[practice_id draft_id section_key], unique: true, name: "scribe_draft_sections_key"
    add_foreign_key :clinic_scribe_draft_sections, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_draft_sections, :clinic_scribe_drafts,
      column: %i[practice_id draft_id], primary_key: %i[practice_id id], name: "fk_scribe_sections_draft"
    add_check_constraint :clinic_scribe_draft_sections,
      "section_key IN ('subjective', 'objective', 'assessment', 'plan') AND status IN ('needs_review', 'accepted', 'edited', 'rejected') AND edit_revision >= 0",
      name: "scribe_draft_sections_values"

    create_table :clinic_scribe_exports do |t|
      t.bigint :practice_id, null: false
      t.bigint :draft_id, null: false
      t.bigint :actor_id, null: false
      t.string :destination, null: false
      t.string :version_checksum, null: false
      t.string :idempotency_key, null: false
      t.string :status, null: false, default: "exported"
      t.string :payload_digest, null: false
      t.datetime :exported_at
      t.timestamps
    end
    add_index :clinic_scribe_exports, %i[practice_id idempotency_key], unique: true, name: "scribe_exports_idempotency"
    add_foreign_key :clinic_scribe_exports, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_exports, :clinic_scribe_drafts,
      column: %i[practice_id draft_id], primary_key: %i[practice_id id], name: "fk_scribe_exports_draft"
    add_foreign_key :clinic_scribe_exports, :users, column: :actor_id
    add_check_constraint :clinic_scribe_exports,
      "destination = 'parent_record_adapter' AND status IN ('exported', 'failed')",
      name: "scribe_exports_values"

    create_table :clinic_scribe_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :draft_id
      t.bigint :actor_id, null: false
      t.string :event_type, null: false
      t.string :resource_type, null: false
      t.bigint :resource_id, null: false
      t.jsonb :metadata, null: false, default: {}
      t.datetime :created_at, null: false
    end
    add_index :clinic_scribe_events, %i[practice_id encounter_id created_at]
    add_foreign_key :clinic_scribe_events, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_events, :clinic_scribe_encounters,
      column: %i[practice_id encounter_id], primary_key: %i[practice_id id], name: "fk_scribe_events_encounter"
    add_foreign_key :clinic_scribe_events, :users, column: :actor_id
  end
end
