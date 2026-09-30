class AddConfiguredDocumentProvenance < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_document_provenance_configurations do |t|
      t.bigint :practice_id, null: false
      t.bigint :category_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.integer :revision, null: false
      t.boolean :applicable, null: false
      t.jsonb :fields, null: false
      t.string :request_key, null: false
      t.datetime :recorded_at, null: false
    end
    add_index :clinic_document_provenance_configurations, %i[practice_id category_id revision], unique: true,
      name: "document_provenance_configuration_revision"
    add_index :clinic_document_provenance_configurations, %i[practice_id id], unique: true,
      name: "document_provenance_configuration_tenant"
    add_foreign_key :clinic_document_provenance_configurations, :clinic_document_categories,
      column: %i[practice_id category_id], primary_key: %i[practice_id id], name: "document_provenance_configuration_category"
    add_foreign_key :clinic_document_provenance_configurations, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id], name: "document_provenance_configuration_actor"
    add_check_constraint :clinic_document_provenance_configurations,
      "revision > 0 AND jsonb_typeof(fields) = 'array' AND fields <@ '[\"source\",\"issuer\",\"issued_date\",\"received_date\"]'::jsonb AND " \
      "((applicable AND jsonb_array_length(fields) > 0) OR (NOT applicable AND jsonb_array_length(fields) = 0))",
      name: "document_provenance_configuration_values"

    create_table :clinic_document_metadata_revisions do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :document_id, null: false
      t.bigint :configuration_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.bigint :prior_revision_id
      t.integer :revision, null: false
      t.string :object_version, null: false
      t.string :checksum, null: false
      t.string :request_key, null: false
      t.text :content, null: false
      t.datetime :recorded_at, null: false
    end
    add_index :clinic_document_metadata_revisions, %i[practice_id document_id revision], unique: true,
      name: "document_metadata_revision_number"
    add_index :clinic_document_metadata_revisions, %i[practice_id document_id id], unique: true,
      name: "document_metadata_revision_context"
    add_foreign_key :clinic_document_metadata_revisions, :clinic_documents,
      column: %i[practice_id patient_id document_id], primary_key: %i[practice_id patient_id id], name: "document_metadata_document"
    add_foreign_key :clinic_document_metadata_revisions, :clinic_document_provenance_configurations,
      column: %i[practice_id configuration_id], primary_key: %i[practice_id id], name: "document_metadata_configuration"
    add_foreign_key :clinic_document_metadata_revisions, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id], name: "document_metadata_actor"
    add_foreign_key :clinic_document_metadata_revisions, :clinic_document_metadata_revisions,
      column: %i[practice_id document_id prior_revision_id], primary_key: %i[practice_id document_id id], name: "document_metadata_prior"
    add_check_constraint :clinic_document_metadata_revisions,
      "revision > 0 AND length(trim(object_version)) > 0 AND length(trim(checksum)) > 0 AND " \
      "((revision = 1 AND prior_revision_id IS NULL) OR (revision > 1 AND prior_revision_id IS NOT NULL))",
      name: "document_metadata_revision_values"
    reversible do |direction|
      direction.up do
        %w[clinic_document_provenance_configurations clinic_document_metadata_revisions].each do |table|
          execute "CREATE TRIGGER #{table}_immutable BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
        end
      end
      direction.down do
        %w[clinic_document_metadata_revisions clinic_document_provenance_configurations].each do |table|
          execute "DROP TRIGGER #{table}_immutable ON #{table}"
        end
      end
    end
  end
end
