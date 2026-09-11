class CreatePlatformOwnerInvitations < ActiveRecord::Migration[8.1]
  def change
    create_table :platform_owner_invitations do |t|
      t.text :email_address, null: false
      t.string :email_digest, limit: 64, null: false
      t.string :token_digest, limit: 64
      t.string :status, null: false, default: "pending"
      t.datetime :invited_at, null: false
      t.datetime :expires_at, null: false
      t.datetime :accepted_at
      t.datetime :revoked_at
      t.timestamps
    end

    add_index :platform_owner_invitations, :email_digest
    add_index :platform_owner_invitations, :token_digest, unique: true,
      where: "token_digest IS NOT NULL", name: "platform_owner_invitations_token"
    add_index :platform_owner_invitations, :status, unique: true,
      where: "status = 'pending'", name: "platform_owner_invitations_one_pending"
    add_column :users, :platform_owner, :boolean, null: false, default: false
    add_index :users, :platform_owner, unique: true,
      where: "platform_owner = TRUE", name: "index_users_on_single_platform_owner"

    add_check_constraint :platform_owner_invitations,
      "status IN ('pending', 'accepted', 'revoked')",
      name: "platform_owner_invitations_status"
    add_check_constraint :platform_owner_invitations,
      "expires_at > invited_at",
      name: "platform_owner_invitations_expiry"
    add_check_constraint :platform_owner_invitations, <<~SQL.squish,
      (
        (status = 'pending' AND token_digest IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL) OR
        (status = 'accepted' AND token_digest IS NULL AND accepted_at IS NOT NULL AND revoked_at IS NULL) OR
        (status = 'revoked' AND token_digest IS NULL AND accepted_at IS NULL AND revoked_at IS NOT NULL)
      )
    SQL
      name: "platform_owner_invitations_state"
  end
end
