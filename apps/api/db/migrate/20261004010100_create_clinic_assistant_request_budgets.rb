class CreateClinicAssistantRequestBudgets < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_assistant_request_budgets do |t|
      t.date :period_on, null: false
      t.string :scope_type, null: false
      t.bigint :user_id
      t.bigint :practice_id
      t.integer :daily_limit, null: false
      t.integer :reserved_count, null: false, default: 0
      t.timestamps
    end

    add_foreign_key :clinic_assistant_request_budgets, :users, on_delete: :restrict
    add_foreign_key :clinic_assistant_request_budgets, :clinic_practices, column: :practice_id, on_delete: :restrict

    add_index :clinic_assistant_request_budgets, :period_on, unique: true,
      where: "scope_type = 'provider_account' AND user_id IS NULL AND practice_id IS NULL",
      name: "assistant_budget_account_day"
    add_index :clinic_assistant_request_budgets, [ :period_on, :practice_id ], unique: true,
      where: "scope_type = 'practice' AND user_id IS NULL AND practice_id IS NOT NULL",
      name: "assistant_budget_practice_day"
    add_index :clinic_assistant_request_budgets, [ :period_on, :user_id ], unique: true,
      where: "scope_type = 'user' AND user_id IS NOT NULL AND practice_id IS NULL",
      name: "assistant_budget_user_day"

    add_check_constraint :clinic_assistant_request_budgets,
      "(scope_type = 'provider_account' AND user_id IS NULL AND practice_id IS NULL) OR " \
      "(scope_type = 'practice' AND user_id IS NULL AND practice_id IS NOT NULL) OR " \
      "(scope_type = 'user' AND user_id IS NOT NULL AND practice_id IS NULL)",
      name: "assistant_budget_scope_values"
    add_check_constraint :clinic_assistant_request_budgets,
      "daily_limit BETWEEN 1 AND 50 AND reserved_count BETWEEN 0 AND daily_limit",
      name: "assistant_budget_count_values"
  end
end
