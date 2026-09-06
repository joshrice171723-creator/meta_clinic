class CreateWorkforceFoundation < ActiveRecord::Migration[8.1]
  def change
    tenant_table :clinic_workforce_employments do |t|
      t.bigint :staff_member_id, null: false
      t.bigint :membership_id, null: false
      t.string :status, null: false, default: "active"
      t.datetime :effective_from, null: false
      t.datetime :effective_until
      t.integer :lock_version, null: false, default: 0
    end
    tenant_fk :clinic_workforce_employments, :staff_member_id, :clinic_staff_members
    tenant_fk :clinic_workforce_employments, :membership_id, :clinic_memberships
    add_index :clinic_workforce_employments, [ :practice_id, :staff_member_id ], unique: true,
      name: "workforce_employments_staff"
    add_index :clinic_workforce_employments, [ :practice_id, :membership_id ], unique: true,
      name: "workforce_employments_membership"
    add_check_constraint :clinic_workforce_employments,
      "status IN ('active','inactive') AND (effective_until IS NULL OR effective_until > effective_from)",
      name: "workforce_employments_state"

    tenant_table :clinic_workforce_employment_sites do |t|
      t.bigint :employment_id, null: false
      t.bigint :site_id, null: false
      t.boolean :active, null: false, default: true
      t.datetime :effective_from, null: false
      t.datetime :effective_until
      t.integer :lock_version, null: false, default: 0
    end
    tenant_fk :clinic_workforce_employment_sites, :employment_id, :clinic_workforce_employments
    tenant_fk :clinic_workforce_employment_sites, :site_id, :clinic_sites
    add_index :clinic_workforce_employment_sites, [ :practice_id, :employment_id, :site_id ], unique: true,
      name: "workforce_employment_sites_identity"
    add_index :clinic_workforce_employment_sites, [ :practice_id, :site_id, :active ],
      name: "workforce_employment_sites_eligibility"
    add_check_constraint :clinic_workforce_employment_sites,
      "effective_until IS NULL OR effective_until > effective_from",
      name: "workforce_employment_sites_window"

    tenant_table :clinic_workforce_settings_versions do |t|
      t.string :scope_kind, null: false
      t.bigint :site_id
      t.integer :revision, null: false
      t.datetime :effective_from, null: false
      t.jsonb :values, null: false
      t.bigint :created_by_membership_id, null: false
    end
    tenant_fk :clinic_workforce_settings_versions, :site_id, :clinic_sites
    tenant_fk :clinic_workforce_settings_versions, :created_by_membership_id, :clinic_memberships
    add_index :clinic_workforce_settings_versions, [ :practice_id, :revision ], unique: true,
      where: "site_id IS NULL", name: "workforce_practice_settings_revision"
    add_index :clinic_workforce_settings_versions, [ :practice_id, :effective_from ], unique: true,
      where: "site_id IS NULL", name: "workforce_practice_settings_effective"
    add_index :clinic_workforce_settings_versions, [ :practice_id, :site_id, :revision ], unique: true,
      where: "site_id IS NOT NULL", name: "workforce_site_settings_revision"
    add_index :clinic_workforce_settings_versions, [ :practice_id, :site_id, :effective_from ], unique: true,
      where: "site_id IS NOT NULL", name: "workforce_site_settings_effective"
    add_check_constraint :clinic_workforce_settings_versions,
      "revision > 0 AND jsonb_typeof(values) = 'object' AND octet_length(values::text) <= 65536 AND " \
      "((scope_kind = 'practice' AND site_id IS NULL) OR (scope_kind = 'site' AND site_id IS NOT NULL))",
      name: "workforce_settings_values"

    tenant_table :clinic_workforce_employee_invitations do |t|
      t.bigint :staff_member_id, null: false
      t.bigint :invited_by_membership_id, null: false
      t.text :email_address, null: false
      t.string :email_digest, limit: 64
      t.string :token_digest, limit: 64
      t.string :status, null: false, default: "pending"
      t.datetime :invited_at, null: false
      t.datetime :expires_at, null: false
      t.datetime :activated_at
      t.datetime :revoked_at
      t.datetime :effective_from, null: false
      t.bigint :site_ids, array: true, null: false, default: []
    end
    tenant_fk :clinic_workforce_employee_invitations, :staff_member_id, :clinic_staff_members
    tenant_fk :clinic_workforce_employee_invitations, :invited_by_membership_id, :clinic_memberships
    add_index :clinic_workforce_employee_invitations, [ :practice_id, :staff_member_id ], unique: true,
      name: "workforce_employee_invitations_staff"
    add_index :clinic_workforce_employee_invitations, :email_digest, unique: true,
      where: "email_digest IS NOT NULL", name: "workforce_employee_invitations_email"
    add_index :clinic_workforce_employee_invitations, :token_digest, unique: true,
      where: "token_digest IS NOT NULL", name: "workforce_employee_invitations_token"
    add_check_constraint :clinic_workforce_employee_invitations,
      "status IN ('pending','activated','revoked') AND expires_at > invited_at AND cardinality(site_ids) BETWEEN 1 AND 100",
      name: "workforce_employee_invitations_state"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_workforce_settings_versions_immutable
          BEFORE UPDATE OR DELETE ON clinic_workforce_settings_versions
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()
        SQL
      end
      direction.down do
        execute "DROP TRIGGER clinic_workforce_settings_versions_immutable ON clinic_workforce_settings_versions"
      end
    end
  end

  private

  def tenant_table(name)
    create_table name do |t|
      t.bigint :practice_id, null: false
      yield t
      t.timestamps
    end
    add_index name, [ :practice_id, :id ], unique: true
    add_foreign_key name, :clinic_practices, column: :practice_id
  end

  def tenant_fk(table, column, target)
    add_foreign_key table, target, column: [ :practice_id, column ], primary_key: [ :practice_id, :id ]
  end
end
