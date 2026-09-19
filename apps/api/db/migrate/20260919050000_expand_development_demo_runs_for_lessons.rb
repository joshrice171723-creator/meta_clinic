class ExpandDevelopmentDemoRunsForLessons < ActiveRecord::Migration[8.1]
  def change
    add_column :development_demo_runs, :lesson_key, :string
    add_column :development_demo_runs, :baseline, :jsonb, null: false, default: {}
    add_column :development_demo_visitors, :clinic_name, :string
    add_column :development_demo_visitors, :lesson_progress, :jsonb, null: false, default: {}

    add_index :development_demo_runs, [ :visitor_id, :lesson_key ], unique: true,
      where: "active AND visitor_id IS NOT NULL AND lesson_key IS NOT NULL",
      name: "development_demo_runs_active_visitor_lesson"
    add_check_constraint :development_demo_runs, "lesson_key IS NULL OR lesson_key <> ''",
      name: "development_demo_runs_lesson_key_present"
  end
end
