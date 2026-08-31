class AddClientPortal < ActiveRecord::Migration[8.1]
  def change
    add_column :materials, :slug, :string
    add_column :materials, :sample, :boolean, null: false, default: false
    add_index :materials, :slug, unique: true
    create_table :learning_progresses do |t|
      t.references :user, null: false, foreign_key: true
      t.references :material, null: false, foreign_key: true
      t.datetime :started_at, null: false
      t.datetime :completed_at
      t.timestamps
    end
    add_index :learning_progresses, %i[user_id material_id], unique: true
    create_table :paperworks do |t|
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false
      t.string :document_version, null: false
      t.text :body, null: false
      t.string :content_digest, null: false
      t.boolean :demo, null: false, default: true
      t.datetime :started_at
      t.datetime :signed_at
      t.text :signature_name
      t.string :signature_digest
      t.string :consent_version
      t.timestamps
    end
    add_check_constraint :paperworks, "signed_at IS NULL OR (started_at IS NOT NULL AND signature_name IS NOT NULL AND signature_digest IS NOT NULL)", name: "signed_paperwork_has_evidence"
  end
end
