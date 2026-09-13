class CreateMembershipGrowth < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_practices, :public_membership_slug, :string
    add_column :clinic_practices, :membership_storefront_enabled, :boolean, null: false, default: false
    add_index :clinic_practices, :public_membership_slug, unique: true,
      where: "public_membership_slug IS NOT NULL", name: "clinic_practices_public_membership_slug"
    add_check_constraint :clinic_practices,
      "public_membership_slug IS NULL OR public_membership_slug ~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$'",
      name: "clinic_practices_public_membership_slug_format"

    create_table :clinic_membership_prospects do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :subscription_version, null: false
      t.string :request_key, null: false, limit: 160
      t.string :request_digest, null: false, limit: 64
      t.string :status, null: false, default: "new"
      t.text :display_name, null: false
      t.text :email_address, null: false
      t.text :phone_number
      t.string :email_digest, null: false, limit: 64
      t.string :phone_digest, limit: 64
      t.jsonb :selected_terms, null: false, default: {}
      t.string :source, limit: 80
      t.boolean :outreach_consent, null: false, default: false
      t.bigint :reviewed_by_membership_id
      t.bigint :patient_id
      t.bigint :portal_identity_id
      t.datetime :reviewed_at
      t.datetime :invited_at
      t.datetime :converted_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end

    add_index :clinic_membership_prospects, [ :practice_id, :id ], unique: true,
      name: "clinic_membership_prospects_practice_id"
    add_index :clinic_membership_prospects, [ :practice_id, :request_key ], unique: true,
      name: "clinic_membership_prospects_request_key"
    add_index :clinic_membership_prospects, [ :practice_id, :status, :created_at ],
      name: "clinic_membership_prospects_pipeline"
    add_index :clinic_membership_prospects, [ :practice_id, :email_digest, :status ],
      name: "clinic_membership_prospects_email_status"
    add_foreign_key :clinic_membership_prospects, :clinic_memberships,
      column: [ :practice_id, :reviewed_by_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_membership_prospects_reviewer"
    add_foreign_key :clinic_membership_prospects, :clinic_subscription_versions,
      column: [ :practice_id, :subscription_version_id ], primary_key: [ :practice_id, :id ],
      name: "fk_membership_prospects_subscription_version"
    add_foreign_key :clinic_membership_prospects, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ],
      name: "fk_membership_prospects_patient"
    add_foreign_key :clinic_membership_prospects, :clinic_patient_portal_identities,
      column: [ :practice_id, :portal_identity_id ], primary_key: [ :practice_id, :id ],
      name: "fk_membership_prospects_portal_identity"
    add_check_constraint :clinic_membership_prospects,
      "status IN ('new', 'contacted', 'qualified', 'invited', 'converted', 'declined')",
      name: "clinic_membership_prospects_status"
    add_check_constraint :clinic_membership_prospects,
      "request_digest ~ '^[0-9a-f]{64}$' AND email_digest ~ '^[0-9a-f]{64}$' AND " \
        "(phone_digest IS NULL OR phone_digest ~ '^[0-9a-f]{64}$')",
      name: "clinic_membership_prospects_digest_format"
    add_check_constraint :clinic_membership_prospects,
      "(status NOT IN ('invited', 'converted')) OR " \
        "(patient_id IS NOT NULL AND portal_identity_id IS NOT NULL AND invited_at IS NOT NULL)",
      name: "clinic_membership_prospects_onboarding_state"
    add_check_constraint :clinic_membership_prospects,
      "status <> 'converted' OR converted_at IS NOT NULL",
      name: "clinic_membership_prospects_conversion_state"
  end
end
