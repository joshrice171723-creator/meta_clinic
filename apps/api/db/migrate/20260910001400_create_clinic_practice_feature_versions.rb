class CreateClinicPracticeFeatureVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_practice_feature_versions do |t|
      t.references :practice, null: false, foreign_key: { to_table: :clinic_practices }
      t.references :created_by_membership, null: false, foreign_key: { to_table: :clinic_memberships }
      t.integer :revision, null: false
      t.jsonb :optional_features, null: false, default: {}
      t.datetime :effective_from, null: false
      t.string :request_key, null: false
      t.string :content_digest, null: false
      t.timestamps
    end

    add_index :clinic_practice_feature_versions, %i[practice_id revision], unique: true,
      name: "idx_practice_feature_versions_revision"
    add_index :clinic_practice_feature_versions, %i[practice_id request_key], unique: true,
      name: "idx_practice_feature_versions_request"
  end
end
