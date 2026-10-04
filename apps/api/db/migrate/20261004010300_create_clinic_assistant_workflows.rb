class CreateClinicAssistantWorkflows < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_assistant_workflow_contexts do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :actor_user, null: false, foreign_key: { to_table: :users }
      t.references :membership, null: false, foreign_key: { to_table: :clinic_memberships }
      # Member sessions are deleted on logout/revocation; keep only a comparison reference.
      t.bigint :member_session_reference, null: false
      t.references :site, null: false, foreign_key: { to_table: :clinic_sites }
      t.references :patient, foreign_key: { to_table: :clinic_patients }
      t.references :encounter, foreign_key: { to_table: :clinic_encounters }
      t.uuid :public_id, null: false, default: -> { "gen_random_uuid()" }
      t.integer :authorization_generation, null: false
      t.jsonb :session_snapshot, null: false, default: {}
      t.text :selection_options, null: false, default: "{}"
      t.datetime :expires_at, null: false
      t.datetime :invalidated_at
      t.timestamps
    end
    add_index :clinic_assistant_workflow_contexts, :public_id, unique: true
    add_index :clinic_assistant_workflow_contexts,
      [ :member_session_reference, :created_at ], name: "idx_assistant_workflow_context_session"
    add_check_constraint :clinic_assistant_workflow_contexts,
      "authorization_generation >= 0 AND jsonb_typeof(session_snapshot) = 'object' AND " \
      "(invalidated_at IS NULL OR invalidated_at >= created_at)",
      name: "assistant_workflow_context_values"

    create_table :clinic_assistant_workflow_proposals do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :workflow_context, null: false,
        foreign_key: { to_table: :clinic_assistant_workflow_contexts }
      t.references :actor_user, null: false, foreign_key: { to_table: :users }
      t.references :membership, null: false, foreign_key: { to_table: :clinic_memberships }
      t.references :site, null: false, foreign_key: { to_table: :clinic_sites }
      t.references :patient, foreign_key: { to_table: :clinic_patients }
      t.references :encounter, foreign_key: { to_table: :clinic_encounters }
      t.bigint :member_session_reference, null: false
      t.uuid :public_id, null: false, default: -> { "gen_random_uuid()" }
      t.string :operation_key, null: false, limit: 80
      t.string :status, null: false, default: "pending", limit: 16
      t.text :arguments, null: false
      t.jsonb :record_versions, null: false, default: {}
      t.text :preview, null: false
      t.text :result_payload
      t.jsonb :result_reference, null: false, default: {}
      t.datetime :expires_at, null: false
      t.datetime :confirmed_at
      t.timestamps
    end
    add_index :clinic_assistant_workflow_proposals, :public_id, unique: true
    add_index :clinic_assistant_workflow_proposals,
      [ :member_session_reference, :created_at ], name: "idx_assistant_workflow_proposal_session"
    add_index :clinic_assistant_workflow_proposals,
      [ :workflow_context_id, :status ], name: "idx_assistant_workflow_proposal_context"
    add_check_constraint :clinic_assistant_workflow_proposals,
      "status IN ('pending','confirmed','expired','invalidated','conflicted') AND " \
      "jsonb_typeof(record_versions) = 'object' AND jsonb_typeof(result_reference) = 'object' AND " \
      "((status = 'confirmed') = (confirmed_at IS NOT NULL AND result_payload IS NOT NULL))",
      name: "assistant_workflow_proposal_values"
  end
end
