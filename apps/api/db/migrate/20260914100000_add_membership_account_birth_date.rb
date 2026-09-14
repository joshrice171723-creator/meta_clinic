class AddMembershipAccountBirthDate < ActiveRecord::Migration[8.1]
  def change
    # Nullable for existing accounts and contact-only prospects. New public
    # account creation validates before capturing interest or creating a user.
    add_column :clinic_membership_prospects, :date_of_birth, :date
    add_column :clinic_membership_prospects, :preferred_contact_method, :string, limit: 20
    add_column :clinic_membership_prospects, :preferred_contact_time, :text
    add_check_constraint :clinic_membership_prospects,
      "preferred_contact_method IS NULL OR preferred_contact_method IN ('email','phone')",
      name: "membership_prospect_contact_method"
    change_column_null :clinic_patient_demographics, :interpreter_required, true
    change_column_default :clinic_patient_demographics, :interpreter_required, from: false, to: nil
  end
end
