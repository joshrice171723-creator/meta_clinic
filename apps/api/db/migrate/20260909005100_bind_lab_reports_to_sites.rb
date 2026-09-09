class BindLabReportsToSites < ActiveRecord::Migration[8.0]
  def up
    add_column :clinic_lab_reports, :site_id, :bigint
    add_index :clinic_lab_reports, [ :practice_id, :site_id ], name: "clinic_lab_reports_site_id"
    add_foreign_key :clinic_lab_reports, :clinic_sites,
      column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ], name: "fk_lab_reports_site"

    execute "DROP TRIGGER clinic_lab_reports_preserve_identity ON clinic_lab_reports"
    execute <<~SQL
      CREATE TRIGGER clinic_lab_reports_preserve_identity
      BEFORE UPDATE ON clinic_lab_reports
      FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity(
        'practice_id', 'patient_id', 'site_id', 'source_name', 'external_report_id', 'external_report_id_digest'
      )
    SQL
  end

  def down
    execute "DROP TRIGGER clinic_lab_reports_preserve_identity ON clinic_lab_reports"
    execute <<~SQL
      CREATE TRIGGER clinic_lab_reports_preserve_identity
      BEFORE UPDATE ON clinic_lab_reports
      FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity(
        'practice_id', 'patient_id', 'source_name', 'external_report_id', 'external_report_id_digest'
      )
    SQL

    remove_foreign_key :clinic_lab_reports, name: "fk_lab_reports_site"
    remove_index :clinic_lab_reports, name: "clinic_lab_reports_site_id"
    remove_column :clinic_lab_reports, :site_id
  end
end
