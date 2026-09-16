class InstallPilotRoleCatalogVersionNine < ActiveRecord::Migration[8.1]
  ROLE_VERSION = 9

  def up
    Clinic::Authorization::PilotRoleCatalog::DEFINITIONS.each do |role_code, definition|
      role = RoleVersion.find_or_create_by!(role_code:, version: ROLE_VERSION)
      definition.fetch(:permissions).each do |action_code|
        permission = Permission.find_or_create_by!(action_code:)
        RoleVersionPermission.find_or_create_by!(role_version: role, permission:)
      end
    end

    role_codes = Clinic::Authorization::PilotRoleCatalog.role_codes.map { |code| connection.quote(code) }.join(", ")
    execute <<~SQL
      INSERT INTO clinic_role_grants (
        practice_id, membership_id, role_version_id, scope_kind, site_id, source_employment_id,
        revision, effective_from, effective_until, revoked_at, created_at, updated_at
      )
      SELECT grants.practice_id, grants.membership_id, current_roles.id, grants.scope_kind, grants.site_id,
        grants.source_employment_id, 1, grants.effective_from, grants.effective_until, NULL,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM clinic_role_grants grants
      JOIN role_versions previous_roles ON previous_roles.id = grants.role_version_id
      JOIN role_versions current_roles ON current_roles.role_code = previous_roles.role_code
        AND current_roles.version = #{ROLE_VERSION}
      WHERE previous_roles.version <> #{ROLE_VERSION}
        AND previous_roles.role_code IN (#{role_codes})
        AND grants.revoked_at IS NULL
        AND grants.effective_from <= CURRENT_TIMESTAMP
        AND (grants.effective_until IS NULL OR grants.effective_until > CURRENT_TIMESTAMP)
        AND NOT EXISTS (
          SELECT 1 FROM clinic_role_grants existing
          WHERE existing.membership_id = grants.membership_id
            AND existing.role_version_id = current_roles.id
            AND existing.scope_kind = grants.scope_kind
            AND existing.site_id IS NOT DISTINCT FROM grants.site_id
            AND existing.revoked_at IS NULL
        )
    SQL

    execute <<~SQL
      WITH retired AS (
        UPDATE clinic_role_grants grants
        SET revoked_at = CURRENT_TIMESTAMP, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
        FROM role_versions roles
        WHERE roles.id = grants.role_version_id
          AND roles.version <> #{ROLE_VERSION}
          AND roles.role_code IN (#{role_codes})
          AND grants.revoked_at IS NULL
          AND grants.effective_from <= CURRENT_TIMESTAMP
          AND (grants.effective_until IS NULL OR grants.effective_until > CURRENT_TIMESTAMP)
        RETURNING grants.membership_id
      )
      UPDATE clinic_memberships memberships
      SET authorization_generation = authorization_generation + 1, updated_at = CURRENT_TIMESTAMP
      WHERE memberships.id IN (SELECT membership_id FROM retired)
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Role-version grants and retained authorization history cannot be removed safely."
  end
end
