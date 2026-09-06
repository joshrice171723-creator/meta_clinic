class AddScribeWorkspaceDocuments < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_scribe_encounters, :context_content, :text
    add_column :clinic_scribe_encounters, :context_digest, :string
    add_column :clinic_scribe_encounters, :context_source_type, :string
    add_column :clinic_scribe_encounters, :context_authored_by_id, :bigint
    add_column :clinic_scribe_encounters, :context_updated_at, :datetime
    add_foreign_key :clinic_scribe_encounters, :users, column: :context_authored_by_id
    add_check_constraint :clinic_scribe_encounters,
      "context_source_type IS NULL OR context_source_type = 'reviewer_authored'",
      name: "scribe_encounters_context_source"
    add_check_constraint :clinic_scribe_encounters,
      "context_digest IS NULL OR length(trim(context_digest)) = 64",
      name: "scribe_encounters_context_digest"

    create_table :clinic_scribe_note_templates do |t|
      t.string :template_id, null: false
      t.integer :version, null: false
      t.string :label, null: false
      t.string :note_kind, null: false, default: "soap"
      t.string :status, null: false, default: "active"
      t.string :disabled_reason
      t.jsonb :sections, null: false, default: {}
      t.timestamps
    end
    add_index :clinic_scribe_note_templates, %i[template_id version], unique: true, name: "scribe_note_templates_identity"
    add_check_constraint :clinic_scribe_note_templates,
      "version > 0 AND note_kind = 'soap' AND status IN ('active', 'disabled', 'legacy')",
      name: "scribe_note_templates_values"

    create_table :clinic_scribe_documents do |t|
      t.bigint :practice_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :created_by_id, null: false
      t.string :template_id, null: false
      t.integer :template_version, null: false
      t.string :status, null: false, default: "active"
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_scribe_documents, %i[practice_id id], unique: true, name: "scribe_documents_practice_id"
    add_index :clinic_scribe_documents, %i[practice_id encounter_id id], unique: true, name: "scribe_documents_scope"
    add_foreign_key :clinic_scribe_documents, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_documents, :clinic_scribe_encounters,
      column: %i[practice_id encounter_id], primary_key: %i[practice_id id], name: "fk_scribe_documents_encounter"
    add_foreign_key :clinic_scribe_documents, :users, column: :created_by_id
    add_check_constraint :clinic_scribe_documents,
      "template_version > 0 AND status IN ('active', 'deleted')",
      name: "scribe_documents_values"

    add_column :clinic_scribe_drafts, :document_id, :bigint
    add_column :clinic_scribe_drafts, :revision_number, :integer
    add_column :clinic_scribe_drafts, :source_snapshot_digest, :string
    add_column :clinic_scribe_drafts, :context_snapshot_digest, :string
    add_column :clinic_scribe_drafts, :input_sources, :jsonb, null: false, default: []
    change_column_null :clinic_scribe_drafts, :source_id, true
    add_column :clinic_scribe_draft_sections, :provenance, :jsonb, null: false, default: {}

    execute <<~SQL
      INSERT INTO clinic_scribe_note_templates
        (template_id, version, label, note_kind, status, disabled_reason, sections, created_at, updated_at)
      VALUES
        ('soap', 1, 'SOAP note', 'soap', 'active', NULL,
          '{"subjective":"","objective":"","assessment":"","plan":""}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('soap-with-labs', 1, 'SOAP note with labs', 'soap', 'disabled',
          'An authorized laboratory source contract is required before this template can be used.',
          '{"subjective":"","objective":"","assessment":"","plan":""}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('documentation-summary', 1, 'Documentation summary', 'soap', 'legacy',
          'Available only for records created before the SOAP document catalog.',
          '{"subjective":"","objective":"","assessment":"","plan":""}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    SQL

    execute <<~SQL
      INSERT INTO clinic_scribe_documents
        (practice_id, encounter_id, created_by_id, template_id, template_version, status, lock_version, created_at, updated_at)
      SELECT practice_id, id, created_by_id, template_id, template_version, 'active', 0, created_at, updated_at
      FROM clinic_scribe_encounters
      WHERE EXISTS (SELECT 1 FROM clinic_scribe_drafts drafts WHERE drafts.encounter_id = clinic_scribe_encounters.id)
    SQL
    execute <<~SQL
      UPDATE clinic_scribe_drafts drafts
      SET document_id = documents.id
      FROM clinic_scribe_documents documents
      WHERE documents.practice_id = drafts.practice_id AND documents.encounter_id = drafts.encounter_id
    SQL
    execute <<~SQL
      WITH numbered AS (
        SELECT id, row_number() OVER (PARTITION BY document_id ORDER BY id) AS revision_number
        FROM clinic_scribe_drafts
      )
      UPDATE clinic_scribe_drafts drafts
      SET revision_number = numbered.revision_number
      FROM numbered
      WHERE numbered.id = drafts.id
    SQL

    change_column_null :clinic_scribe_drafts, :document_id, false
    change_column_null :clinic_scribe_drafts, :revision_number, false
    add_index :clinic_scribe_drafts, %i[practice_id document_id revision_number], unique: true, name: "scribe_drafts_document_revision"
    add_index :clinic_scribe_drafts, %i[practice_id document_id id], unique: true, name: "scribe_drafts_document_id"
    add_foreign_key :clinic_scribe_drafts, :clinic_scribe_documents,
      column: %i[practice_id encounter_id document_id], primary_key: %i[practice_id encounter_id id],
      name: "fk_scribe_drafts_document"

    add_column :clinic_scribe_documents, :current_draft_id, :bigint
    add_foreign_key :clinic_scribe_documents, :clinic_scribe_drafts,
      column: %i[practice_id id current_draft_id], primary_key: %i[practice_id document_id id],
      name: "fk_scribe_documents_current_draft"
    execute <<~SQL
      UPDATE clinic_scribe_documents documents
      SET current_draft_id = current_revisions.id
      FROM (
        SELECT DISTINCT ON (document_id) document_id, id
        FROM clinic_scribe_drafts
        WHERE status NOT IN ('superseded', 'deleted')
        ORDER BY document_id, id DESC
      ) current_revisions
      WHERE current_revisions.document_id = documents.id
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Scribe documents may contain context-only revisions and cannot be restored to the required transcript foreign key."
  end
end
