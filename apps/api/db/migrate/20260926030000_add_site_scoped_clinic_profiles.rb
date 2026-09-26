class AddSiteScopedClinicProfiles < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_practice_feature_versions, :site_id, :bigint
    add_foreign_key :clinic_practice_feature_versions, :clinic_sites,
      column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ],
      name: "fk_practice_feature_versions_site"
    remove_index :clinic_practice_feature_versions, name: "idx_practice_feature_versions_revision"
    add_index :clinic_practice_feature_versions, %i[practice_id revision], unique: true,
      where: "site_id IS NULL", name: "idx_practice_feature_versions_revision"
    add_index :clinic_practice_feature_versions, %i[practice_id site_id revision], unique: true,
      where: "site_id IS NOT NULL", name: "idx_site_feature_versions_revision"

    execute <<~SQL
      INSERT INTO clinic_practice_feature_versions
        (practice_id, site_id, created_by_membership_id, revision, optional_features,
         effective_from, request_key, content_digest, created_at, updated_at)
      SELECT s.practice_id, s.id, profile.created_by_membership_id, 1, profile.optional_features,
        profile.effective_from, 'legacy-site-profile-' || s.id, profile.content_digest,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM clinic_sites s
      JOIN LATERAL (
        SELECT feature.*
        FROM clinic_practice_feature_versions feature
        WHERE feature.practice_id = s.practice_id AND feature.site_id IS NULL
          AND feature.optional_features ? 'clinic_type'
        ORDER BY feature.revision DESC, feature.id DESC
        LIMIT 1
      ) profile ON TRUE
      WHERE EXISTS (
        SELECT 1 FROM clinic_patients patient
        WHERE patient.practice_id = s.practice_id AND patient.primary_site_id = s.id
      )
    SQL
  end

  def down
    remove_index :clinic_practice_feature_versions, name: "idx_site_feature_versions_revision"
    remove_index :clinic_practice_feature_versions, name: "idx_practice_feature_versions_revision"
    add_index :clinic_practice_feature_versions, %i[practice_id revision], unique: true,
      name: "idx_practice_feature_versions_revision"
    remove_foreign_key :clinic_practice_feature_versions, name: "fk_practice_feature_versions_site"
    remove_column :clinic_practice_feature_versions, :site_id
  end
end
