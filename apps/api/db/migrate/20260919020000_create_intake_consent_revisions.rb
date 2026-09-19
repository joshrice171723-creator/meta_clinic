class CreateIntakeConsentRevisions < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_intake_consent_revisions do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.string :purpose, null: false, limit: 64
      t.integer :revision, null: false
      t.text :content, null: false
      t.string :request_key, null: false, limit: 160
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.timestamps
    end

    add_index :clinic_intake_consent_revisions, %i[practice_id id], unique: true, name: "intake_consent_practice_id"
    add_index :clinic_intake_consent_revisions, %i[practice_id patient_id purpose revision], unique: true, name: "intake_consent_revision"
    add_index :clinic_intake_consent_revisions, %i[practice_id recorded_by_membership_id request_key], unique: true, name: "intake_consent_request"
    add_foreign_key :clinic_intake_consent_revisions, :clinic_practices, column: :practice_id, name: "fk_intake_consent_practice"
    add_foreign_key :clinic_intake_consent_revisions, :clinic_patients, column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_intake_consent_patient"
    add_foreign_key :clinic_intake_consent_revisions, :clinic_memberships, column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id], name: "fk_intake_consent_recorder"
    add_check_constraint :clinic_intake_consent_revisions,
      "purpose IN ('treatment', 'privacy_notice', 'product_counseling', 'ai_recording', 'marketing') AND revision > 0 AND length(trim(request_key)) BETWEEN 1 AND 160 AND length(content) > 0",
      name: "intake_consent_values"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_intake_consent_revisions_immutable
          BEFORE UPDATE OR DELETE ON clinic_intake_consent_revisions
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_intake_consent_revisions_immutable ON clinic_intake_consent_revisions"
      end
    end
  end
end
