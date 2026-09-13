class AddAstraIdentityAppearancePalette < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :identity_preferences, name: "identity_preferences_palette"
    add_check_constraint :identity_preferences,
      "palette IN ('astra', 'owner', 'juniper', 'cobalt', 'plum', 'saffron')",
      name: "identity_preferences_palette"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve saved Astra appearance preferences."
  end
end
