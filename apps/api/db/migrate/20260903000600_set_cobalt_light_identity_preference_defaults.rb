class SetCobaltLightIdentityPreferenceDefaults < ActiveRecord::Migration[8.1]
  def up
    change_column_default :identity_preferences, :palette, from: "juniper", to: "cobalt"
    change_column_default :identity_preferences, :mode, from: "system", to: "light"
  end

  def down
    change_column_default :identity_preferences, :palette, from: "cobalt", to: "juniper"
    change_column_default :identity_preferences, :mode, from: "light", to: "system"
  end
end
