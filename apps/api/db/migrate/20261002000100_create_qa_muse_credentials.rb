class CreateQaMuseCredentials < ActiveRecord::Migration[8.1]
  def change
    change_column_null :qa_evidence, :issue_number, true
    add_column :qa_evidence, :workflow_ids, :jsonb, null: false, default: []
    remove_check_constraint :qa_evidence, "issue_number > 0 AND octet_length(image) BETWEEN 1 AND 4194304", name: "qa_evidence_size"
    add_check_constraint :qa_evidence, "octet_length(image) BETWEEN 1 AND 4194304 AND (COALESCE(issue_number > 0, false) OR (issue_number IS NULL AND jsonb_array_length(workflow_ids) > 0))", name: "qa_evidence_size"
    add_check_constraint :qa_evidence, "jsonb_typeof(workflow_ids) = 'array'", name: "qa_evidence_workflow_ids_array"
    add_index :qa_evidence, [:revision, :digest], where: "issue_number IS NULL", name: "index_qa_workflow_evidence_revision_digest"

    create_table :qa_muse_credentials do |t|
      t.references :user, null: false, foreign_key: true
      t.references :approved_by, null: false, foreign_key: { to_table: :users }
      t.string :identity, null: false, default: "muse"
      t.string :fingerprint, null: false
      t.text :public_key_pem, null: false
      t.jsonb :scopes, null: false, default: []
      t.datetime :revoked_at
      t.datetime :last_used_at
      t.timestamps
    end
    add_index :qa_muse_credentials, :fingerprint, unique: true
    add_index :qa_muse_credentials, :identity, unique: true, where: "revoked_at IS NULL", name: "index_qa_muse_credentials_one_active_identity"
    add_check_constraint :qa_muse_credentials, "identity = 'muse'", name: "qa_muse_credential_identity"
    add_check_constraint :qa_muse_credentials, "jsonb_typeof(scopes) = 'array'", name: "qa_muse_credential_scopes_array"

    create_table :qa_muse_nonces do |t|
      t.references :credential, null: false, foreign_key: { to_table: :qa_muse_credentials }
      t.string :nonce, null: false
      t.datetime :expires_at, null: false
      t.datetime :created_at, null: false
    end
    add_index :qa_muse_nonces, [:credential_id, :nonce], unique: true
    add_index :qa_muse_nonces, :expires_at
  end
end
