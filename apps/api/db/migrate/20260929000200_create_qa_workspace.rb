class CreateQaWorkspace < ActiveRecord::Migration[8.1]
  def change
    create_table :qa_events do |t|
      t.references :user, null: false, foreign_key: true
      t.string :event_key, null: false
      t.string :kind, null: false
      t.string :summary, null: false
      t.string :revision
      t.jsonb :payload, null: false, default: {}
      t.datetime :created_at, null: false
    end
    add_index :qa_events, :event_key, unique: true
    add_index :qa_events, :created_at
    create_table :qa_tasks do |t|
      t.references :user, null: false, foreign_key: true
      t.references :claimed_by, foreign_key: { to_table: :users }
      t.string :request_key, null: false
      t.string :kind, null: false
      t.string :title, null: false
      t.string :recipient, null: false
      t.string :status, null: false, default: "queued"
      t.string :revision
      t.string :claim_run_id
      t.datetime :claimed_at
      t.jsonb :payload, null: false, default: {}
      t.jsonb :result, null: false, default: {}
      t.jsonb :human_decision, null: false, default: {}
      t.timestamps
    end
    add_index :qa_tasks, :request_key, unique: true
    add_index :qa_tasks, [:recipient, :status]
    add_index :qa_tasks, :claim_run_id, unique: true
    add_check_constraint :qa_tasks, "status IN ('queued', 'claimed', 'completed', 'failed', 'cancelled')", name: "qa_task_status"
    add_check_constraint :qa_tasks, "recipient IN ('muse', 'codex')", name: "qa_task_recipient"
    create_table :qa_snapshots do |t|
      t.string :key, null: false
      t.jsonb :data, null: false, default: {}
      t.timestamps
    end
    add_index :qa_snapshots, :key, unique: true
    create_table :qa_evidence do |t|
      t.references :user, null: false, foreign_key: true
      t.integer :issue_number, null: false
      t.string :revision, null: false
      t.string :caption, null: false
      t.string :content_type, null: false
      t.binary :image, null: false
      t.string :digest, null: false
      t.string :phase, null: false, default: "after"
      t.jsonb :context, null: false, default: {}
      t.datetime :created_at, null: false
    end
    add_index :qa_evidence, [:issue_number, :created_at]
    add_index :qa_evidence, [:issue_number, :revision, :digest], unique: true
    add_check_constraint :qa_evidence, "issue_number > 0 AND octet_length(image) BETWEEN 1 AND 4194304", name: "qa_evidence_size"
    create_table :qa_service_tokens do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name, null: false
      t.string :recipient, null: false
      t.string :digest, null: false
      t.datetime :revoked_at
      t.datetime :last_used_at
      t.timestamps
    end
    add_index :qa_service_tokens, :digest, unique: true
    reversible do |dir|
      dir.up do
        execute <<~SQL
          CREATE FUNCTION qa_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'QA history is append-only'; END; $$;
          CREATE TRIGGER qa_events_immutable BEFORE UPDATE OR DELETE ON qa_events FOR EACH ROW EXECUTE FUNCTION qa_reject_history_change();
          CREATE TRIGGER qa_evidence_immutable BEFORE UPDATE OR DELETE ON qa_evidence FOR EACH ROW EXECUTE FUNCTION qa_reject_history_change();
        SQL
      end
      dir.down do
        execute "DROP TRIGGER qa_events_immutable ON qa_events; DROP TRIGGER qa_evidence_immutable ON qa_evidence; DROP FUNCTION qa_reject_history_change();"
      end
    end
  end
end
