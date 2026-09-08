class CreateClinicLabReports < ActiveRecord::Migration[8.0]
  def change
    create_table :clinic_lab_reports do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.string :source_name, null: false, limit: 160
      t.text :external_report_id
      t.string :external_report_id_digest, limit: 64
      t.bigint :current_version_id
      t.timestamps
    end
    add_index :clinic_lab_reports, [ :practice_id, :id ], unique: true, name: "clinic_lab_reports_practice_id"
    add_index :clinic_lab_reports, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_lab_reports_patient_id"
    add_index :clinic_lab_reports, [ :practice_id, :patient_id, :external_report_id_digest ], unique: true,
      where: "external_report_id_digest IS NOT NULL", name: "clinic_lab_reports_external_identity"
    add_foreign_key :clinic_lab_reports, :clinic_practices, column: :practice_id, name: "fk_lab_reports_practice"
    add_foreign_key :clinic_lab_reports, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ], name: "fk_lab_reports_patient"
    add_check_constraint :clinic_lab_reports,
      "length(trim(source_name)) > 0 AND (external_report_id_digest IS NULL OR length(external_report_id_digest) = 64)",
      name: "clinic_lab_reports_values"

    create_table :clinic_lab_report_versions do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :lab_report_id, null: false
      t.integer :version_number, null: false
      t.text :title, null: false
      t.string :status, null: false
      t.column :collected_at, "timestamp(6) with time zone", null: false
      t.column :issued_at, "timestamp(6) with time zone", null: false
      t.text :results_payload, null: false
      t.string :entry_kind, null: false, default: "manual"
      t.string :content_digest, null: false, limit: 64
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.bigint :reviewed_by_membership_id
      t.column :reviewed_at, "timestamp(6) with time zone"
      t.timestamps
    end
    add_index :clinic_lab_report_versions, [ :practice_id, :patient_id, :id ], unique: true,
      name: "clinic_lab_report_versions_patient_id"
    add_index :clinic_lab_report_versions, [ :practice_id, :patient_id, :lab_report_id, :id ], unique: true,
      name: "clinic_lab_report_versions_report_id"
    add_index :clinic_lab_report_versions, [ :practice_id, :lab_report_id, :version_number ], unique: true,
      name: "clinic_lab_report_versions_number"
    add_foreign_key :clinic_lab_report_versions, :clinic_practices, column: :practice_id, name: "fk_lab_versions_practice"
    add_foreign_key :clinic_lab_report_versions, :clinic_patients,
      column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ], name: "fk_lab_versions_patient"
    add_foreign_key :clinic_lab_report_versions, :clinic_lab_reports,
      column: [ :practice_id, :patient_id, :lab_report_id ], primary_key: [ :practice_id, :patient_id, :id ],
      name: "fk_lab_versions_report"
    add_foreign_key :clinic_lab_report_versions, :clinic_memberships,
      column: [ :practice_id, :recorded_by_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_lab_versions_recorder"
    add_foreign_key :clinic_lab_report_versions, :clinic_memberships,
      column: [ :practice_id, :reviewed_by_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_lab_versions_reviewer"
    add_check_constraint :clinic_lab_report_versions,
      "version_number > 0 AND status IN ('preliminary','final','amended','corrected','cancelled') AND " \
      "entry_kind = 'manual' AND length(content_digest) = 64",
      name: "clinic_lab_report_versions_values"
    add_check_constraint :clinic_lab_report_versions,
      "issued_at >= collected_at", name: "clinic_lab_report_versions_timeline"
    add_check_constraint :clinic_lab_report_versions,
      "(reviewed_at IS NULL AND reviewed_by_membership_id IS NULL) OR " \
      "(reviewed_at IS NOT NULL AND reviewed_by_membership_id IS NOT NULL)",
      name: "clinic_lab_report_versions_review_pair"

    add_foreign_key :clinic_lab_reports, :clinic_lab_report_versions,
      column: [ :practice_id, :patient_id, :id, :current_version_id ],
      primary_key: [ :practice_id, :patient_id, :lab_report_id, :id ], name: "fk_lab_reports_current_version"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_lab_reports_preserve_identity
          BEFORE UPDATE ON clinic_lab_reports
          FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity(
            'practice_id', 'patient_id', 'source_name', 'external_report_id', 'external_report_id_digest'
          )
        SQL
        execute <<~SQL
          CREATE FUNCTION clinic_lab_report_versions_protect() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF TG_OP = 'DELETE' THEN
              RAISE EXCEPTION 'Lab report versions are append-only';
            END IF;
            IF OLD.practice_id IS DISTINCT FROM NEW.practice_id
              OR OLD.patient_id IS DISTINCT FROM NEW.patient_id
              OR OLD.lab_report_id IS DISTINCT FROM NEW.lab_report_id
              OR OLD.version_number IS DISTINCT FROM NEW.version_number
              OR OLD.title IS DISTINCT FROM NEW.title
              OR OLD.status IS DISTINCT FROM NEW.status
              OR OLD.collected_at IS DISTINCT FROM NEW.collected_at
              OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
              OR OLD.results_payload IS DISTINCT FROM NEW.results_payload
              OR OLD.entry_kind IS DISTINCT FROM NEW.entry_kind
              OR OLD.content_digest IS DISTINCT FROM NEW.content_digest
              OR OLD.recorded_by_membership_id IS DISTINCT FROM NEW.recorded_by_membership_id
              OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at THEN
              RAISE EXCEPTION 'Lab report version payloads are immutable';
            END IF;
            IF OLD.reviewed_at IS NOT NULL AND (
              OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
              OR OLD.reviewed_by_membership_id IS DISTINCT FROM NEW.reviewed_by_membership_id
            ) THEN
              RAISE EXCEPTION 'Lab report review evidence is write-once';
            END IF;
            RETURN NEW;
          END;
          $$;
          CREATE TRIGGER clinic_lab_report_versions_protect
          BEFORE UPDATE OR DELETE ON clinic_lab_report_versions
          FOR EACH ROW EXECUTE FUNCTION clinic_lab_report_versions_protect();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_lab_report_versions_protect ON clinic_lab_report_versions"
        execute "DROP FUNCTION IF EXISTS clinic_lab_report_versions_protect()"
        execute "DROP TRIGGER IF EXISTS clinic_lab_reports_preserve_identity ON clinic_lab_reports"
      end
    end
  end
end
