class CreatePlatformOwnerPasswordResets < ActiveRecord::Migration[8.1]
  def change
    create_table :platform_owner_password_resets do |t|
      t.references :user, null: false, foreign_key: true
      t.string :token_digest
      t.datetime :requested_at, null: false
      t.datetime :expires_at, null: false
      t.datetime :used_at
      t.datetime :revoked_at
      t.timestamps
    end

    add_index :platform_owner_password_resets, :token_digest, unique: true,
      where: "token_digest IS NOT NULL", name: "platform_owner_password_resets_token"
    add_index :platform_owner_password_resets, :user_id, unique: true,
      where: "used_at IS NULL AND revoked_at IS NULL", name: "platform_owner_password_resets_one_pending"
    add_check_constraint :platform_owner_password_resets, "expires_at > requested_at",
      name: "platform_owner_password_resets_expiry"
    add_check_constraint :platform_owner_password_resets, "used_at IS NULL OR revoked_at IS NULL",
      name: "platform_owner_password_resets_terminal_state"
  end
end
