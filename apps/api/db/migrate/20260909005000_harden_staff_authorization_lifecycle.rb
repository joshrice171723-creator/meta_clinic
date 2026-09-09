class HardenStaffAuthorizationLifecycle < ActiveRecord::Migration[8.0]
  ROLE_VERSION = 4

  def up
    add_column :clinic_memberships, :authorization_generation, :integer, null: false, default: 1
    add_check_constraint :clinic_memberships, "authorization_generation > 0",
      name: "clinic_memberships_authorization_generation_positive"
    add_column :clinic_role_grants, :source_employment_id, :bigint
    add_index :clinic_role_grants, [ :practice_id, :source_employment_id ],
      name: "index_clinic_role_grants_on_practice_and_source_employment"
    add_foreign_key :clinic_role_grants, :clinic_workforce_employments,
      column: [ :practice_id, :source_employment_id ], primary_key: [ :practice_id, :id ],
      name: "fk_role_grants_source_employment"
    Clinic::Authorization::PilotRoleCatalog::DEFINITIONS.each do |role_code, definition|
      role = RoleVersion.find_or_create_by!(role_code: role_code, version: ROLE_VERSION)
      definition.fetch(:permissions).each do |action_code|
        permission = Permission.find_or_create_by!(action_code: action_code)
        RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
      end
    end

    execute <<~SQL
      UPDATE clinic_role_grants grants
      SET source_employment_id = employments.id
      FROM clinic_workforce_employments employments, role_versions roles
      WHERE grants.practice_id = employments.practice_id
        AND grants.membership_id = employments.membership_id
        AND roles.id = grants.role_version_id
        AND grants.source_employment_id IS NULL
        AND (roles.role_code LIKE 'workforce-%' OR roles.role_code IN (
          'workforce-employee', 'clinic-administrator', 'billing-accounting', 'front-desk-coordinator', 'clinician',
          'clinical-staff', 'inventory-coordinator', 'records-viewer', 'payroll-operator'
        ))
    SQL

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
        AND previous_roles.role_code IN (
          'workforce-employee', 'clinic-administrator', 'billing-accounting', 'front-desk-coordinator', 'clinician',
          'clinical-staff', 'inventory-coordinator', 'records-viewer', 'payroll-operator'
        )
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
          AND roles.role_code IN (
            'workforce-employee', 'clinic-administrator', 'billing-accounting', 'front-desk-coordinator', 'clinician',
            'clinical-staff', 'inventory-coordinator', 'records-viewer', 'payroll-operator'
          )
          AND grants.revoked_at IS NULL
          AND grants.effective_from <= CURRENT_TIMESTAMP
          AND (grants.effective_until IS NULL OR grants.effective_until > CURRENT_TIMESTAMP)
        RETURNING grants.membership_id
      )
      UPDATE clinic_memberships memberships
      SET authorization_generation = authorization_generation + 1, updated_at = CURRENT_TIMESTAMP
      WHERE memberships.id IN (SELECT membership_id FROM retired)
    SQL

    execute "DROP TRIGGER clinic_role_grants_preserve_identity ON clinic_role_grants"
    execute <<~SQL
      CREATE TRIGGER clinic_role_grants_preserve_identity
      BEFORE UPDATE ON clinic_role_grants
      FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity(
        'practice_id', 'membership_id', 'role_version_id', 'scope_kind', 'site_id', 'source_employment_id'
      )
    SQL
  end

  def down
    execute "DROP TRIGGER clinic_role_grants_preserve_identity ON clinic_role_grants"
    execute <<~SQL
      CREATE TRIGGER clinic_role_grants_preserve_identity
      BEFORE UPDATE ON clinic_role_grants
      FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity(
        'practice_id', 'membership_id', 'role_version_id', 'scope_kind', 'site_id'
      )
    SQL
    remove_foreign_key :clinic_role_grants, name: "fk_role_grants_source_employment"
    remove_index :clinic_role_grants, name: "index_clinic_role_grants_on_practice_and_source_employment"
    remove_column :clinic_role_grants, :source_employment_id
    remove_check_constraint :clinic_memberships, name: "clinic_memberships_authorization_generation_positive"
    remove_column :clinic_memberships, :authorization_generation
  end
end
