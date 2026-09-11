class AddOwnerIdentityAppearancePalette < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :identity_preferences, name: "identity_preferences_palette"
    add_check_constraint :identity_preferences,
      "palette IN ('owner', 'juniper', 'cobalt', 'plum', 'saffron')",
      name: "identity_preferences_palette"
  end

  def down
    execute "UPDATE identity_preferences SET palette = 'cobalt' WHERE palette = 'owner'"
    remove_check_constraint :identity_preferences, name: "identity_preferences_palette"
    add_check_constraint :identity_preferences,
      "palette IN ('juniper', 'cobalt', 'plum', 'saffron')",
      name: "identity_preferences_palette"
  end
end
