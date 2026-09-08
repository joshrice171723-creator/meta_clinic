class LinkEmployeeInvitationsToRoles < ActiveRecord::Migration[8.1]
  def up
    ensure_workforce_role_catalog

    add_reference :clinic_workforce_employee_invitations, :role_version,
      null: true, foreign_key: true, index: true
    execute <<~SQL
      UPDATE clinic_workforce_employee_invitations
      SET role_version_id = (
        SELECT id FROM role_versions
        WHERE role_code = 'workforce-employee' AND version = 1
      )
      WHERE role_version_id IS NULL;
    SQL
    change_column_null :clinic_workforce_employee_invitations, :role_version_id, false
  end

  def down
    remove_reference :clinic_workforce_employee_invitations, :role_version,
      foreign_key: true, index: true
  end

  private

  def ensure_workforce_role_catalog
    execute <<~SQL
      INSERT INTO permissions (action_code, created_at, updated_at)
      VALUES ('roles.manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (action_code) DO NOTHING;

      INSERT INTO role_versions (role_code, version, created_at, updated_at)
      VALUES ('workforce-employee', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (role_code, version) DO NOTHING;

      INSERT INTO role_version_permissions (role_version_id, permission_id, created_at, updated_at)
      SELECT role.id, permission.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM role_versions role CROSS JOIN permissions permission
      WHERE role.role_code = 'workforce-administrator'
        AND role.version = 1
        AND permission.action_code = 'roles.manage'
        AND NOT EXISTS (
          SELECT 1 FROM role_version_permissions existing
          WHERE existing.role_version_id = role.id
            AND existing.permission_id = permission.id
        );
    SQL
  end
end
