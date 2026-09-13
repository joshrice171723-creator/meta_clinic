class PreventDuplicateMembershipCheckouts < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_membership_prospects,
      [ :practice_id, :email_digest, :subscription_version_id ],
      unique: true,
      where: "intent_type = 'purchase' AND status IN " \
        "('checkout_pending', 'payment_processing', 'paid_onboarding', 'contacted', 'converted')",
      name: "clinic_membership_prospects_active_purchase"
  end
end
