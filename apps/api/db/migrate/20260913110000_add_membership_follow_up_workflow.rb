class AddMembershipFollowUpWorkflow < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_membership_prospects, :follow_up_state, :string, null: false, default: "not_required"
    add_column :clinic_membership_prospects, :follow_up_assigned_to_membership_id, :bigint
    add_column :clinic_membership_prospects, :follow_up_due_at, :datetime
    add_column :clinic_membership_prospects, :follow_up_started_at, :datetime
    add_column :clinic_membership_prospects, :follow_up_attempted_at, :datetime
    add_column :clinic_membership_prospects, :follow_up_attempt_count, :integer, null: false, default: 0
    add_column :clinic_membership_prospects, :follow_up_outcome, :string

    add_foreign_key :clinic_membership_prospects, :clinic_memberships,
      column: [ :practice_id, :follow_up_assigned_to_membership_id ],
      primary_key: [ :practice_id, :id ], name: "fk_membership_prospects_follow_up_assignee"
    add_check_constraint :clinic_membership_prospects,
      "follow_up_state IN ('not_required','open','in_progress','waiting','completed')",
      name: "clinic_membership_prospects_follow_up_state"
    add_check_constraint :clinic_membership_prospects,
      "follow_up_outcome IS NULL OR follow_up_outcome IN " \
        "('checkout_opened','no_answer','callback_requested','not_interested','payment_verified')",
      name: "clinic_membership_prospects_follow_up_outcome"
    add_check_constraint :clinic_membership_prospects, "follow_up_attempt_count >= 0",
      name: "clinic_membership_prospects_follow_up_attempt_count"
    add_check_constraint :clinic_membership_prospects,
      "follow_up_state NOT IN ('in_progress','waiting') OR follow_up_assigned_to_membership_id IS NOT NULL",
      name: "clinic_membership_prospects_follow_up_assignment"

    execute <<~SQL.squish
      UPDATE clinic_membership_prospects
      SET follow_up_state = 'open', follow_up_due_at = CURRENT_TIMESTAMP
      WHERE intent_type = 'purchase'
        AND status IN ('checkout_pending', 'checkout_expired', 'payment_failed')
    SQL
    execute <<~SQL.squish
      UPDATE clinic_membership_prospects
      SET follow_up_state = 'completed', follow_up_outcome = 'payment_verified'
      WHERE intent_type = 'purchase' AND status IN ('paid_onboarding', 'converted')
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Membership follow-up ownership and attempt history must be preserved with a forward migration."
  end
end
