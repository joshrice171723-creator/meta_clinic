class AddProspectContactAndPortalHandoff < ActiveRecord::Migration[8.1]
  def up
    change_column_null :clinic_membership_prospects, :email_address, true
    change_column_null :clinic_membership_prospects, :email_digest, true
    add_column :clinic_membership_prospects, :portal_setup_token, :text
    add_column :clinic_membership_prospects, :portal_setup_expires_at, :datetime

    remove_check_constraint :clinic_membership_prospects, name: "clinic_membership_prospects_digest_format"
    add_check_constraint :clinic_membership_prospects,
      "request_digest ~ '^[0-9a-f]{64}$' AND " \
        "(email_digest IS NULL OR email_digest ~ '^[0-9a-f]{64}$') AND " \
        "(phone_digest IS NULL OR phone_digest ~ '^[0-9a-f]{64}$') AND " \
        "(email_digest IS NOT NULL OR phone_digest IS NOT NULL)",
      name: "clinic_membership_prospects_digest_format"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Prospect contact flexibility and paid checkout handoff evidence must be preserved with a forward migration."
  end
end
