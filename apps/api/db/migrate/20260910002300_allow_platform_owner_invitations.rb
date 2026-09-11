class AllowPlatformOwnerInvitations < ActiveRecord::Migration[8.1]
  def up
    add_reference :clinic_workforce_employee_invitations, :invited_by_platform_user,
      null: true, foreign_key: { to_table: :users }, index: { name: "workforce_invitations_platform_user" }
    change_column_null :clinic_workforce_employee_invitations, :invited_by_membership_id, true
    add_check_constraint :clinic_workforce_employee_invitations,
      "(invited_by_membership_id IS NOT NULL) <> (invited_by_platform_user_id IS NOT NULL)",
      name: "workforce_employee_invitations_inviter"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Platform-issued clinic owner invitations must retain their inviter history."
  end
end
