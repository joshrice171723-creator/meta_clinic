class AllowRegrantedClinicRoles < ActiveRecord::Migration[8.1]
  def up
    remove_index :clinic_role_grants, name: "clinic_role_grants_practice_scope_identity"
    remove_index :clinic_role_grants, name: "clinic_role_grants_site_scope_identity"

    add_index :clinic_role_grants, %i[practice_id membership_id role_version_id scope_kind],
      unique: true, where: "site_id IS NULL AND revoked_at IS NULL",
      name: "clinic_role_grants_practice_scope_identity"
    add_index :clinic_role_grants, %i[practice_id membership_id role_version_id scope_kind site_id],
      unique: true, where: "site_id IS NOT NULL AND revoked_at IS NULL",
      name: "clinic_role_grants_site_scope_identity"
  end

  def down
    remove_index :clinic_role_grants, name: "clinic_role_grants_practice_scope_identity"
    remove_index :clinic_role_grants, name: "clinic_role_grants_site_scope_identity"

    add_index :clinic_role_grants, %i[practice_id membership_id role_version_id scope_kind],
      unique: true, where: "site_id IS NULL", name: "clinic_role_grants_practice_scope_identity"
    add_index :clinic_role_grants, %i[practice_id membership_id role_version_id scope_kind site_id],
      unique: true, where: "site_id IS NOT NULL", name: "clinic_role_grants_site_scope_identity"
  end
end
