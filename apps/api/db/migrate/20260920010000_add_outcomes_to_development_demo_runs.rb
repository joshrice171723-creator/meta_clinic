class AddOutcomesToDevelopmentDemoRuns < ActiveRecord::Migration[8.1]
  def change
    add_column :development_demo_runs, :elapsed_seconds, :integer, null: false, default: 0
    add_column :development_demo_runs, :completed_at, :datetime

    add_check_constraint :development_demo_runs, "elapsed_seconds >= 0",
      name: "development_demo_runs_elapsed_seconds_nonnegative"
  end
end
