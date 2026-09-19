class CreateDevelopmentDemoRuns < ActiveRecord::Migration[8.0]
  def change
    create_table :development_demo_runs do |t|
      t.string :template_key, null: false
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :operator_user, null: false, index: { unique: true }, foreign_key: { to_table: :users }
      t.references :patient_user, foreign_key: { to_table: :users }
      t.references :membership_prospect, foreign_key: { to_table: :clinic_membership_prospects }
      t.boolean :active, null: false, default: true
      t.timestamps
    end

    add_index :development_demo_runs, :practice_id, where: "active", name: "development_demo_runs_active_practice"
    add_check_constraint :development_demo_runs, "template_key <> ''", name: "development_demo_runs_template_key_present"
  end
end
