class ScopeOfficeCoordination < ActiveRecord::Migration[8.1]
  def change
    add_column :qa_service_tokens, :scope, :string, null: false, default: "qa"
    add_check_constraint :qa_service_tokens, "scope IN ('qa', 'office')", name: "qa_service_scope"
    add_column :qa_tasks, :request_digest, :string
    add_column :qa_tasks, :claim_principal, :string
    add_column :qa_tasks, :lease_expires_at, :datetime
    remove_check_constraint :qa_tasks, name: "qa_task_status", expression: "status IN ('queued', 'claimed', 'completed', 'failed', 'cancelled')"
    add_check_constraint :qa_tasks, "status IN ('proposed', 'queued', 'claimed', 'completed', 'failed', 'cancelled')", name: "qa_task_status"
  end
end
