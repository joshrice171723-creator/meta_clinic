class AddWorkforceRoleCatalog < ActiveRecord::Migration[8.1]
  PERMISSIONS = %w[
    workforce.admin workforce.settings workforce.badges
    workforce.timecards.read workforce.timecards.review workforce.timecards.approve
    workforce.schedule.read workforce.schedule.manage workforce.schedule.publish
    workforce.requests.review workforce.payroll.configure workforce.payroll.export
  ].freeze

  def up
    roles = {
      "workforce-administrator" => PERMISSIONS,
      "workforce-location-manager" => PERMISSIONS - %w[workforce.admin workforce.payroll.configure workforce.payroll.export],
      "workforce-payroll-operator" => %w[workforce.timecards.read workforce.payroll.configure workforce.payroll.export]
    }
    PERMISSIONS.each do |permission|
      execute <<~SQL
        INSERT INTO permissions (action_code, created_at, updated_at)
        VALUES (#{connection.quote(permission)}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (action_code) DO NOTHING;
      SQL
    end
    roles.each do |code, permissions|
      execute <<~SQL
        INSERT INTO role_versions (role_code, version, created_at, updated_at)
        VALUES (#{connection.quote(code)}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (role_code, version) DO NOTHING;
      SQL
      permissions.each do |permission|
        execute <<~SQL
          INSERT INTO role_version_permissions (role_version_id, permission_id, created_at, updated_at)
          SELECT r.id, p.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM role_versions r CROSS JOIN permissions p
          WHERE r.role_code = #{connection.quote(code)} AND r.version = 1 AND p.action_code = #{connection.quote(permission)}
            AND NOT EXISTS (SELECT 1 FROM role_version_permissions existing WHERE existing.role_version_id = r.id AND existing.permission_id = p.id);
        SQL
      end
    end
    # Definitions only: existing accounts receive no new grants or clinical access.
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Role catalog definitions may be referenced by immutable grant history"
  end
end
