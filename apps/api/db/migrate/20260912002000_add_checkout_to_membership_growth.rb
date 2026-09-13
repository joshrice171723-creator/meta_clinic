class AddCheckoutToMembershipGrowth < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_membership_prospects, :intent_type, :string, null: false, default: "outreach"
    add_column :clinic_membership_prospects, :checkout_reference, :string, limit: 35
    add_column :clinic_membership_prospects, :checkout_session_id, :string
    add_column :clinic_membership_prospects, :checkout_account_id, :string
    add_column :clinic_membership_prospects, :checkout_mode, :string
    add_column :clinic_membership_prospects, :application_fee_cents, :integer
    add_column :clinic_membership_prospects, :checkout_status, :string
    add_column :clinic_membership_prospects, :agreement_id, :bigint
    add_column :clinic_membership_prospects, :receipt_id, :bigint
    add_column :clinic_membership_prospects, :onboarding_task_id, :bigint
    add_column :clinic_membership_prospects, :paid_at, :datetime
    add_column :clinic_membership_prospects, :receipt_sent_at, :datetime

    add_index :clinic_membership_prospects, :checkout_reference, unique: true,
      where: "checkout_reference IS NOT NULL", name: "clinic_membership_prospects_checkout_reference"
    add_index :clinic_billing_receipts, [ :practice_id, :id ], unique: true,
      name: "clinic_billing_receipts_practice_id"
    add_index :clinic_clinical_tasks, [ :practice_id, :id ], unique: true,
      name: "clinic_clinical_tasks_practice_id"
    add_foreign_key :clinic_membership_prospects, :clinic_subscription_agreements,
      column: [ :practice_id, :agreement_id ], primary_key: [ :practice_id, :id ],
      name: "fk_membership_prospects_agreement"
    add_foreign_key :clinic_membership_prospects, :clinic_billing_receipts,
      column: [ :practice_id, :receipt_id ], primary_key: [ :practice_id, :id ],
      name: "fk_membership_prospects_receipt"
    add_foreign_key :clinic_membership_prospects, :clinic_clinical_tasks,
      column: [ :practice_id, :onboarding_task_id ], primary_key: [ :practice_id, :id ],
      name: "fk_membership_prospects_onboarding_task"

    remove_check_constraint :clinic_membership_prospects, name: "clinic_membership_prospects_status"
    remove_check_constraint :clinic_membership_prospects, name: "clinic_membership_prospects_onboarding_state"
    add_check_constraint :clinic_membership_prospects,
      "status IN ('new', 'contacted', 'qualified', 'invited', 'converted', 'declined', " \
        "'checkout_pending', 'payment_processing', 'paid_onboarding', 'checkout_expired', 'payment_failed')",
      name: "clinic_membership_prospects_status"
    add_check_constraint :clinic_membership_prospects,
      "intent_type IN ('outreach', 'purchase')",
      name: "clinic_membership_prospects_intent_type"
    add_check_constraint :clinic_membership_prospects,
      "(status NOT IN ('paid_onboarding', 'converted')) OR " \
        "(patient_id IS NOT NULL AND portal_identity_id IS NOT NULL AND agreement_id IS NOT NULL " \
        "AND receipt_id IS NOT NULL AND onboarding_task_id IS NOT NULL AND invited_at IS NOT NULL AND paid_at IS NOT NULL)",
      name: "clinic_membership_prospects_onboarding_state"
  end
end
