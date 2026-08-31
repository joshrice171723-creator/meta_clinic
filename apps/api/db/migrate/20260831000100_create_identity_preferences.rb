class CreateIdentityPreferences < ActiveRecord::Migration[8.1]
  def change
    create_table :identity_preferences do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.string :palette, null: false, default: "sage"
      t.string :mode, null: false, default: "system"
      t.integer :revision, null: false, default: 0
      t.timestamps
    end
    add_check_constraint :identity_preferences, "palette IN ('sage', 'blue', 'graphite')", name: "identity_preferences_palette"
    add_check_constraint :identity_preferences, "mode IN ('system', 'light', 'dark')", name: "identity_preferences_mode"
    add_check_constraint :identity_preferences, "revision >= 0", name: "identity_preferences_revision"
  end
end
