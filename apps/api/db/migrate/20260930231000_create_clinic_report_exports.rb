class CreateClinicReportExports < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_report_exports do |t|
      t.bigint :practice_id, :issued_by_id, null: false
      t.bigint :site_id
      t.string :report_id, :request_key, :source_digest, :artifact_digest, :filename, null: false
      t.jsonb :filters, :snapshot, null: false
      t.integer :serializer_revision, :artifact_bytes, null: false
      t.text :artifact_csv, null: false
      t.datetime :issued_at, null: false
      t.timestamps
    end
    add_index :clinic_report_exports, %i[practice_id issued_by_id request_key], unique: true,
      name: "clinic_report_exports_retry"
    add_index :clinic_report_exports, %i[practice_id issued_by_id report_id id], name: "clinic_report_exports_history"
    add_foreign_key :clinic_report_exports, :clinic_practices, column: :practice_id, name: "clinic_report_exports_practice_fk"
    add_foreign_key :clinic_report_exports, :users, column: :issued_by_id, name: "clinic_report_exports_actor_fk"
    add_foreign_key :clinic_report_exports, :clinic_sites, column: :site_id, name: "clinic_report_exports_site_fk"
    add_foreign_key :clinic_report_exports, :clinic_sites, column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "clinic_report_exports_site_scope_fk"
    add_check_constraint :clinic_report_exports,
      "report_id IN ('daily_visits_by_state', 'daily_invoices', 'daily_payment_activity', 'daily_stock_movements', 'current_stock') AND (site_id IS NULL OR report_id = 'daily_visits_by_state') AND jsonb_typeof(filters) = 'object' AND jsonb_typeof(snapshot) = 'object' AND serializer_revision > 0 AND artifact_bytes BETWEEN 1 AND 2000000 AND artifact_bytes = octet_length(artifact_csv) AND source_digest ~ '^[0-9a-f]{64}$' AND artifact_digest ~ '^[0-9a-f]{64}$' AND length(request_key) BETWEEN 1 AND 160 AND length(filename) > 0",
      name: "clinic_report_exports_values"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION clinic_report_export_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'Report export issuance history is append-only';
          END;
          $$;
        SQL
        execute "CREATE TRIGGER clinic_report_exports_immutable BEFORE UPDATE OR DELETE ON clinic_report_exports FOR EACH ROW EXECUTE FUNCTION clinic_report_export_immutable()"
        execute "CREATE TRIGGER clinic_report_exports_no_truncate BEFORE TRUNCATE ON clinic_report_exports FOR EACH STATEMENT EXECUTE FUNCTION clinic_report_export_immutable()"
      end
      direction.down do
        execute "DROP TRIGGER clinic_report_exports_no_truncate ON clinic_report_exports"
        execute "DROP TRIGGER clinic_report_exports_immutable ON clinic_report_exports"
        execute "DROP FUNCTION clinic_report_export_immutable()"
      end
    end
  end
end
