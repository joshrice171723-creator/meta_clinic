class IsolateDemoSandboxByVisitor < ActiveRecord::Migration[8.1]
  def up
    add_reference :development_demo_lessons, :visitor, foreign_key: { to_table: :development_demo_visitors }
    remove_index :development_demo_lessons, name: "index_development_demo_lessons_on_lesson_key"
    add_index :development_demo_lessons, :lesson_key, unique: true,
      where: "visitor_id IS NULL", name: "development_demo_lessons_shared_key"
    add_index :development_demo_lessons, [ :visitor_id, :lesson_key ], unique: true,
      where: "visitor_id IS NOT NULL", name: "development_demo_lessons_visitor_key"

    remove_index :development_demo_runs, name: "development_demo_runs_one_active_lesson"
    add_index :development_demo_runs, :lesson_key, unique: true,
      where: "active AND lesson_key IS NOT NULL AND lesson_key <> 'sandbox'",
      name: "development_demo_runs_one_active_lesson"
  end

  def down
    duplicate_lesson = select_value(<<~SQL)
      SELECT lesson_key FROM development_demo_lessons
      GROUP BY lesson_key HAVING COUNT(*) > 1 LIMIT 1
    SQL
    active_sandboxes = select_value(<<~SQL).to_i
      SELECT COUNT(*) FROM development_demo_runs
      WHERE active AND lesson_key = 'sandbox'
    SQL
    raise ActiveRecord::IrreversibleMigration, "Multiple visitor sandboxes exist" if duplicate_lesson || active_sandboxes > 1

    remove_index :development_demo_runs, name: "development_demo_runs_one_active_lesson"
    add_index :development_demo_runs, :lesson_key, unique: true,
      where: "active AND lesson_key IS NOT NULL", name: "development_demo_runs_one_active_lesson"
    remove_index :development_demo_lessons, name: "development_demo_lessons_visitor_key"
    remove_index :development_demo_lessons, name: "development_demo_lessons_shared_key"
    remove_reference :development_demo_lessons, :visitor, foreign_key: { to_table: :development_demo_visitors }
    add_index :development_demo_lessons, :lesson_key, unique: true
  end
end
