class AddClinicOperationalPolicyVersions < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_operational_policy_versions do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.integer :revision, null: false
      t.jsonb :block_categories, null: false, default: []
      t.jsonb :waiting_thresholds, null: false, default: []
      t.bigint :written_by_membership_id, null: false
      t.string :request_key, null: false
      t.string :content_digest, null: false
      t.datetime :effective_from, null: false
      t.timestamps
    end
    add_index :clinic_operational_policy_versions, %i[practice_id site_id revision], unique: true,
      name: "clinic_operational_policy_revision"
    add_index :clinic_operational_policy_versions, %i[practice_id site_id request_key], unique: true,
      name: "clinic_operational_policy_request"
    add_index :clinic_operational_policy_versions, %i[practice_id site_id id], unique: true,
      name: "clinic_operational_policy_context"
    add_foreign_key :clinic_operational_policy_versions, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_operational_policy_versions, :clinic_memberships,
      column: %i[practice_id written_by_membership_id], primary_key: %i[practice_id id]
    add_check_constraint :clinic_operational_policy_versions,
      "revision > 0 AND jsonb_typeof(block_categories) = 'array' AND jsonb_typeof(waiting_thresholds) = 'array'",
      name: "clinic_operational_policy_values"
    execute <<~SQL
      CREATE TRIGGER clinic_operational_policy_immutable
      BEFORE UPDATE OR DELETE ON clinic_operational_policy_versions
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve clinic policy history; use a reviewed forward migration."
  end
end
