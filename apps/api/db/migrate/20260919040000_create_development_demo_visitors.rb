class CreateDevelopmentDemoVisitors < ActiveRecord::Migration[8.0]
  def change
    create_table :development_demo_visitors do |t|
      t.string :name, null: false, limit: 160
      t.string :email, null: false, limit: 254
      t.string :company, null: false, limit: 200
      t.timestamps
    end
    add_reference :development_demo_runs, :visitor, foreign_key: { to_table: :development_demo_visitors }
  end
end
