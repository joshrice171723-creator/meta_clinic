class AddConfiguredInventoryProfile < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :clinic_inventory_profiles, name: "inventory_profile_scope"
    add_check_constraint :clinic_inventory_profiles,
      "version > 0 AND status IN ('draft','configured','synthetic','suspended','retired') AND capabilities <@ ARRAY['inventory']::varchar[]",
      name: "inventory_profile_scope"

    execute <<~SQL
      CREATE OR REPLACE FUNCTION inventory_authorize(clinic bigint, actor bigint, action text, profile bigint DEFAULT NULL) RETURNS bigint LANGUAGE plpgsql AS $$
      DECLARE member_id bigint; configuration clinic_inventory_profiles%ROWTYPE; required_permission text;
      BEGIN
        PERFORM 1 FROM clinic_practices WHERE id = clinic FOR SHARE;
        SELECT m.id INTO member_id FROM clinic_memberships m JOIN users u ON u.id = m.user_id WHERE m.practice_id = clinic AND m.user_id = actor AND m.active AND u.active FOR SHARE OF m;
        IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE = 'Actor has no active clinic membership'; END IF;
        required_permission := CASE WHEN action IN ('recall.lock', 'recall.dispose') THEN action ELSE 'inventory.' || action END;
        IF NOT EXISTS (
          SELECT 1 FROM clinic_role_grants g
          JOIN role_version_permissions rvp ON rvp.role_version_id = g.role_version_id
          JOIN permissions p ON p.id = rvp.permission_id
          WHERE g.practice_id = clinic AND g.membership_id = member_id AND g.scope_kind = 'practice'
            AND g.effective_from <= CURRENT_TIMESTAMP AND (g.effective_until IS NULL OR g.effective_until > CURRENT_TIMESTAMP)
            AND g.revoked_at IS NULL AND p.action_code = required_permission
        ) THEN
          RAISE EXCEPTION 'Inventory action not permitted';
        END IF;
        SELECT * INTO configuration FROM clinic_inventory_profiles WHERE practice_id = clinic ORDER BY version DESC LIMIT 1;
        IF action <> 'configure' AND (configuration.id IS NULL OR configuration.status NOT IN ('configured','synthetic') OR NOT ('inventory' = ANY(configuration.capabilities)) OR (profile IS NOT NULL AND profile <> configuration.id)) THEN
          RAISE EXCEPTION 'Inventory profile is unavailable or stale';
        END IF;
        RETURN configuration.id;
      END; $$;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Inventory configuration must remain explicit."
  end
end
