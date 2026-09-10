class AuthorizeMedicationInventoryPosting < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE OR REPLACE FUNCTION inventory_authorize(clinic bigint, actor bigint, action text, profile bigint DEFAULT NULL)
      RETURNS bigint LANGUAGE plpgsql AS $$
      DECLARE member_id bigint; configuration clinic_inventory_profiles%ROWTYPE; required_permission text;
        requested_action text; requested_site bigint;
      BEGIN
        PERFORM 1 FROM clinic_practices WHERE id = clinic FOR SHARE;
        SELECT m.id INTO member_id FROM clinic_memberships m JOIN users u ON u.id = m.user_id
          WHERE m.practice_id = clinic AND m.user_id = actor AND m.active AND u.active FOR SHARE OF m;
        IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE = 'Actor has no active clinic membership'; END IF;
        requested_action := NULLIF(current_setting('apply.inventory_action', true), '');
        requested_site := NULLIF(current_setting('apply.inventory_site', true), '')::bigint;
        required_permission := CASE
          WHEN action IN ('recall.lock', 'recall.dispose') THEN action
          WHEN action = 'adjust' AND requested_action = 'medication_administrations.write'
            THEN requested_action
          ELSE 'inventory.' || action
        END;
        IF NOT EXISTS (
          SELECT 1 FROM clinic_role_grants g
          JOIN role_version_permissions rvp ON rvp.role_version_id = g.role_version_id
          JOIN permissions p ON p.id = rvp.permission_id
          WHERE g.practice_id = clinic AND g.membership_id = member_id
            AND g.effective_from <= CURRENT_TIMESTAMP
            AND (g.effective_until IS NULL OR g.effective_until > CURRENT_TIMESTAMP)
            AND g.revoked_at IS NULL AND p.action_code = required_permission
            AND (
              g.scope_kind = 'practice' OR
              (required_permission = 'medication_administrations.write' AND
                g.scope_kind = 'site' AND g.site_id = requested_site)
            )
        ) THEN
          RAISE EXCEPTION 'Inventory action not permitted';
        END IF;
        SELECT * INTO configuration FROM clinic_inventory_profiles
          WHERE practice_id = clinic ORDER BY version DESC LIMIT 1;
        IF action <> 'configure' AND (
          configuration.id IS NULL OR configuration.status NOT IN ('configured','synthetic') OR
          NOT ('inventory' = ANY(configuration.capabilities)) OR
          (profile IS NOT NULL AND profile <> configuration.id)
        ) THEN
          RAISE EXCEPTION 'Inventory profile is unavailable or stale';
        END IF;
        RETURN configuration.id;
      END; $$;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Medication-linked inventory authorization history cannot be removed safely."
  end
end
