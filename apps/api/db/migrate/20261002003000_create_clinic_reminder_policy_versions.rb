class CreateClinicReminderPolicyVersions < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_reminder_policy_versions do |t|
      t.bigint :practice_id, null: false
      t.integer :revision, null: false
      t.boolean :enabled, null: false
      t.integer :lead_hours, null: false
      t.bigint :written_by_membership_id, null: false
      t.string :request_key, null: false
      t.string :content_digest, null: false
      t.datetime :effective_from, null: false
      t.timestamps
    end
    add_index :clinic_reminder_policy_versions, %i[practice_id revision], unique: true, name: "clinic_reminder_policy_revision"
    add_index :clinic_reminder_policy_versions, %i[practice_id request_key], unique: true, name: "clinic_reminder_policy_request"
    add_foreign_key :clinic_reminder_policy_versions, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_reminder_policy_versions, :clinic_memberships,
      column: %i[practice_id written_by_membership_id], primary_key: %i[practice_id id]
    add_check_constraint :clinic_reminder_policy_versions, "revision > 0 AND lead_hours BETWEEN 1 AND 168", name: "clinic_reminder_policy_values"
    execute <<~SQL
      CREATE TRIGGER clinic_reminder_policy_immutable
      BEFORE UPDATE OR DELETE ON clinic_reminder_policy_versions
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve reminder configuration history; use a reviewed forward migration."
  end
end
