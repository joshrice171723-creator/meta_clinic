class AllowSharedDemoOperatorReentry < ActiveRecord::Migration[8.1]
  def change
    remove_index :development_demo_runs, :operator_user_id, unique: true
    add_index :development_demo_runs, :operator_user_id
    add_index :development_demo_runs, :operator_user_id, unique: true, where: "active",
      name: "development_demo_runs_one_active_operator"
  end
end
