class ReplaceIdentityAppearancePalettes < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :identity_preferences, name: "identity_preferences_palette"

    execute <<~SQL
      UPDATE identity_preferences
      SET palette = CASE palette
        WHEN 'sage' THEN 'juniper'
        WHEN 'blue' THEN 'cobalt'
        WHEN 'graphite' THEN 'plum'
        ELSE palette
      END
    SQL

    change_column_default :identity_preferences, :palette, from: "sage", to: "juniper"
    add_check_constraint :identity_preferences,
      "palette IN ('juniper', 'cobalt', 'plum', 'saffron')",
      name: "identity_preferences_palette"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Saffron preferences have no equivalent in the replaced palette set."
  end
end
