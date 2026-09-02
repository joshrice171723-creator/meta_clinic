class AllowAppendOnlyPatientMembershipVersions < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER TABLE clinic_patient_memberships DROP CONSTRAINT IF EXISTS clinic_patient_memberships_no_overlap"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Append-only patient membership versions cannot restore the overlap constraint."
  end
end
