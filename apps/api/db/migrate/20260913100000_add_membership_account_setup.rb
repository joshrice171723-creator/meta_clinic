class AddMembershipAccountSetup < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_membership_prospects, :account_user_id, :bigint
    add_column :clinic_membership_prospects, :account_setup_token_digest, :string, limit: 64
    add_column :clinic_membership_prospects, :account_setup_expires_at, :datetime
    add_column :clinic_membership_prospects, :account_setup_sent_at, :datetime
    add_column :clinic_membership_prospects, :account_activated_at, :datetime
    add_column :clinic_membership_prospects, :accepted_terms_version, :string, limit: 80
    add_column :clinic_membership_prospects, :accepted_terms_at, :datetime

    add_index :clinic_membership_prospects, :account_user_id, unique: true,
      where: "account_user_id IS NOT NULL", name: "clinic_membership_prospects_account_user"
    add_index :clinic_membership_prospects, :account_setup_token_digest, unique: true,
      where: "account_setup_token_digest IS NOT NULL", name: "clinic_membership_prospects_account_setup_token"
    add_foreign_key :clinic_membership_prospects, :users, column: :account_user_id,
      name: "fk_membership_prospects_account_user"
    add_check_constraint :clinic_membership_prospects,
      "account_setup_token_digest IS NULL OR account_setup_token_digest ~ '^[0-9a-f]{64}$'",
      name: "clinic_membership_prospects_account_setup_token_digest"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Membership account setup establishes an enrollment identity and must be preserved with a forward migration."
  end
end
