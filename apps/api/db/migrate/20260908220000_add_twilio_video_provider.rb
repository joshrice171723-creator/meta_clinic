class AddTwilioVideoProvider < ActiveRecord::Migration[8.1]
  def up
    change_column_default :clinic_telehealth_settings, :provider_code, from: "daily", to: "twilio"

    remove_check_constraint :clinic_telehealth_settings, name: "telehealth_settings_values"
    add_check_constraint :clinic_telehealth_settings,
      "provider_code IN ('daily','twilio') AND health_status IN ('not_checked','ready','degraded','unconfigured')",
      name: "telehealth_settings_values"

    add_column :clinic_telehealth_room_attempts, :provider_room_ref, :string, limit: 64
    add_index :clinic_telehealth_room_attempts, [ :provider_code, :provider_account_ref, :provider_room_ref ], unique: true,
      where: "provider_room_ref IS NOT NULL", name: "idx_telehealth_provider_room_ref"
    remove_check_constraint :clinic_telehealth_room_attempts, name: "telehealth_room_attempt_values"
    add_check_constraint :clinic_telehealth_room_attempts, <<~SQL.squish, name: "telehealth_room_attempt_values"
      attempt_no > 0 AND provider_code IN ('daily','twilio') AND access_generation > 0 AND
      status IN ('pending','provisioning','ready','active','ending','ended','failed','unknown') AND expires_at > created_at AND
      (provider_room_ref IS NULL OR
       (provider_code = 'twilio' AND provider_room_ref ~ '^RM[0-9A-Fa-f]{32}$'))
    SQL

    remove_index :clinic_telehealth_join_grants, :token_digest
    add_index :clinic_telehealth_join_grants, :token_digest

    remove_check_constraint :clinic_telehealth_provider_events, name: "telehealth_provider_event_values"
    add_check_constraint :clinic_telehealth_provider_events,
      "provider_code IN ('daily','twilio') AND length(payload_digest) = 64 AND jsonb_typeof(normalized_metadata) = 'object'",
      name: "telehealth_provider_event_values"
  end

  def down
    remove_index :clinic_telehealth_join_grants, :token_digest
    add_index :clinic_telehealth_join_grants, :token_digest, unique: true

    remove_check_constraint :clinic_telehealth_provider_events, name: "telehealth_provider_event_values"
    add_check_constraint :clinic_telehealth_provider_events,
      "provider_code = 'daily' AND length(payload_digest) = 64 AND jsonb_typeof(normalized_metadata) = 'object'",
      name: "telehealth_provider_event_values"

    remove_check_constraint :clinic_telehealth_room_attempts, name: "telehealth_room_attempt_values"
    remove_index :clinic_telehealth_room_attempts, name: "idx_telehealth_provider_room_ref"
    remove_column :clinic_telehealth_room_attempts, :provider_room_ref
    add_check_constraint :clinic_telehealth_room_attempts, <<~SQL.squish, name: "telehealth_room_attempt_values"
      attempt_no > 0 AND provider_code = 'daily' AND access_generation > 0 AND
      status IN ('pending','provisioning','ready','active','ending','ended','failed','unknown') AND expires_at > created_at
    SQL

    remove_check_constraint :clinic_telehealth_settings, name: "telehealth_settings_values"
    add_check_constraint :clinic_telehealth_settings,
      "provider_code = 'daily' AND health_status IN ('not_checked','ready','degraded','unconfigured')",
      name: "telehealth_settings_values"
    change_column_default :clinic_telehealth_settings, :provider_code, from: "twilio", to: "daily"
  end
end
