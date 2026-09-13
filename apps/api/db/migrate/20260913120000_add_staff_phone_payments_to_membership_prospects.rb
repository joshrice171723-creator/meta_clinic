class AddStaffPhonePaymentsToMembershipProspects < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_membership_prospects, :staff_payment_customer_id, :string
    add_column :clinic_membership_prospects, :staff_payment_setup_intent_id, :string
    add_column :clinic_membership_prospects, :staff_payment_subscription_id, :string
    add_column :clinic_membership_prospects, :staff_payment_product_id, :string
    add_column :clinic_membership_prospects, :staff_payment_price_id, :string
    add_column :clinic_membership_prospects, :staff_payment_reader_id, :string
    add_column :clinic_membership_prospects, :staff_payment_status, :string
    add_column :clinic_membership_prospects, :recurring_authorized_at, :datetime
    add_column :clinic_membership_prospects, :recurring_authorized_by_membership_id, :bigint
    add_column :clinic_membership_prospects, :recurring_authorization_version, :string

    add_foreign_key :clinic_membership_prospects, :clinic_memberships,
      column: [ :practice_id, :recurring_authorized_by_membership_id ],
      primary_key: [ :practice_id, :id ], name: "fk_membership_prospects_recurring_authorizer"
    add_index :clinic_membership_prospects, [ :checkout_account_id, :staff_payment_customer_id ], unique: true,
      where: "staff_payment_customer_id IS NOT NULL", name: "membership_prospects_staff_customer"
    add_index :clinic_membership_prospects, [ :checkout_account_id, :staff_payment_setup_intent_id ], unique: true,
      where: "staff_payment_setup_intent_id IS NOT NULL", name: "membership_prospects_staff_setup_intent"
    add_index :clinic_membership_prospects, [ :checkout_account_id, :staff_payment_subscription_id ], unique: true,
      where: "staff_payment_subscription_id IS NOT NULL", name: "membership_prospects_staff_subscription"
    add_check_constraint :clinic_membership_prospects,
      "staff_payment_status IS NULL OR staff_payment_status IN " \
        "('awaiting_card','payment_processing','paid','failed')",
      name: "membership_prospects_staff_payment_status"
    add_check_constraint :clinic_membership_prospects,
      "recurring_authorized_at IS NULL OR " \
        "(recurring_authorized_by_membership_id IS NOT NULL AND recurring_authorization_version IS NOT NULL)",
      name: "membership_prospects_recurring_authorization"

    remove_check_constraint :clinic_membership_prospects, name: "clinic_membership_prospects_follow_up_outcome"
    add_check_constraint :clinic_membership_prospects,
      "follow_up_outcome IS NULL OR follow_up_outcome IN " \
        "('checkout_opened','phone_payment_started','no_answer','callback_requested','not_interested','payment_verified')",
      name: "clinic_membership_prospects_follow_up_outcome"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Staff payment identities and recurring authorization evidence must be preserved."
  end
end
