class ExtendPatientPortalIdentityLifecycle < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_patient_portal_identities, :invitation_digest, :string
    add_column :clinic_patient_portal_identities, :invitation_expires_at, :datetime
    add_column :clinic_patient_portal_identities, :accepted_terms_version, :string
    add_column :clinic_patient_portal_identities, :accepted_terms_at, :datetime
    add_column :clinic_patient_portal_identities, :revoked_reason, :string
    add_column :clinic_patient_portal_identities, :last_step_up_at, :datetime

    add_index :clinic_patient_portal_identities, :invitation_digest, unique: true,
      where: "invitation_digest IS NOT NULL",
      name: "clinic_patient_portal_identities_invitation_digest"
    add_check_constraint :clinic_patient_portal_identities,
      "(status <> 'invited') OR (invitation_digest IS NOT NULL AND invitation_expires_at IS NOT NULL)",
      name: "clinic_patient_portal_identity_invitation_state"
  end
end
