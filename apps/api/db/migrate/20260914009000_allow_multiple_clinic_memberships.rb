class AllowMultipleClinicMemberships < ActiveRecord::Migration[8.1]
  def up
    remove_index :clinic_memberships, name: "index_clinic_memberships_on_user_id"
    add_index :clinic_memberships, :user_id
  end

  def down
    if select_value("SELECT 1 FROM clinic_memberships GROUP BY user_id HAVING count(*) > 1 LIMIT 1")
      raise ActiveRecord::IrreversibleMigration, "Multiple clinic assignments must be resolved before rollback"
    end
    remove_index :clinic_memberships, name: "index_clinic_memberships_on_user_id"
    add_index :clinic_memberships, :user_id, unique: true
  end
end
