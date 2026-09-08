class AddCreatedAtToClinicModelVersions < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_model_versions, :created_at, :datetime
    execute "UPDATE clinic_model_versions SET created_at = occurred_at"
    change_column_null :clinic_model_versions, :created_at, false
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve model-change history; restore a verified backup for rollback."
  end
end
