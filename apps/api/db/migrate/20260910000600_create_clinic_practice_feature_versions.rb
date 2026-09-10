class CreateClinicPracticeFeatureVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_practice_feature_versions do |t|
      t.bigint :practice_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.integer :version, null: false
      t.boolean :insurance_workflows_enabled, null: false, default: false
      t.string :reason, null: false, limit: 240
      t.string :request_key, null: false, limit: 160
      t.string :content_digest, null: false, limit: 64
      t.column :effective_from, "timestamp(6) with time zone", null: false
      t.timestamps
    end

    add_index :clinic_practice_feature_versions, %i[practice_id id], unique: true,
      name: "clinic_practice_feature_versions_practice_id"
    add_index :clinic_practice_feature_versions, %i[practice_id version], unique: true,
      name: "clinic_practice_feature_versions_version"
    add_index :clinic_practice_feature_versions, %i[practice_id request_key], unique: true,
      name: "clinic_practice_feature_versions_request"
    add_index :clinic_practice_feature_versions, %i[practice_id effective_from version],
      name: "clinic_practice_feature_versions_effective"
    add_foreign_key :clinic_practice_feature_versions, :clinic_practices, column: :practice_id,
      name: "fk_practice_feature_versions_practice"
    add_foreign_key :clinic_practice_feature_versions, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_practice_feature_versions_recorder"
    add_check_constraint :clinic_practice_feature_versions,
      "version > 0 AND length(trim(reason)) BETWEEN 1 AND 240 AND length(content_digest) = 64",
      name: "clinic_practice_feature_versions_values"

    execute <<~SQL
      CREATE TRIGGER clinic_practice_feature_versions_immutable
      BEFORE UPDATE OR DELETE ON clinic_practice_feature_versions
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Practice feature history is evidence; restore a reviewed backup instead."
  end
end
