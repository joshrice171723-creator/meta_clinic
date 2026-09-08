class CreateWorkforcePayroll < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_workforce_payroll_configuration_versions do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.bigint :created_by_membership_id, null: false
      t.integer :revision, null: false
      t.datetime :effective_from, null: false
      t.string :name, null: false
      t.string :provider, null: false, default: "custom_file"
      t.jsonb :columns, null: false, default: []
      t.jsonb :employee_identifiers, null: false, default: {}
      t.timestamps
    end
    create_table :clinic_workforce_export_batches do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.bigint :configuration_version_id, null: false
      t.bigint :created_by_membership_id, null: false
      t.bigint :supersedes_batch_id
      t.string :request_key, null: false
      t.string :payload_digest, null: false
      t.string :source_digest, null: false
      t.jsonb :source_versions, null: false, default: []
      t.jsonb :rows, null: false, default: []
      t.jsonb :totals, null: false, default: {}
      t.text :csv_content, null: false
      t.timestamps
    end
    add_index :clinic_workforce_payroll_configuration_versions, [:practice_id, :id], unique: true, name: "wf_payroll_config_tenant_id"
    add_index :clinic_workforce_payroll_configuration_versions, [:practice_id, :site_id, :revision], unique: true, name: "wf_payroll_config_revision"
    add_index :clinic_workforce_payroll_configuration_versions, [:practice_id, :site_id, :effective_from], unique: true, name: "wf_payroll_config_effective"
    add_index :clinic_workforce_export_batches, [:practice_id, :id], unique: true, name: "wf_export_tenant_id"
    add_index :clinic_workforce_export_batches, [:practice_id, :request_key], unique: true, name: "wf_export_retry"
    add_index :clinic_workforce_export_batches, [:practice_id, :site_id, :created_at], name: "wf_export_site_history"
    add_index :clinic_workforce_export_batches, :supersedes_batch_id, unique: true, where: "supersedes_batch_id IS NOT NULL", name: "wf_export_single_successor"
    %i[clinic_workforce_payroll_configuration_versions clinic_workforce_export_batches].each do |table|
      add_foreign_key table, :clinic_practices, column: :practice_id
      add_foreign_key table, :clinic_sites, column: [:practice_id, :site_id], primary_key: [:practice_id, :id]
      add_foreign_key table, :clinic_memberships, column: [:practice_id, :created_by_membership_id], primary_key: [:practice_id, :id]
    end
    add_foreign_key :clinic_workforce_export_batches, :clinic_workforce_payroll_configuration_versions, column: [:practice_id, :configuration_version_id], primary_key: [:practice_id, :id]
    add_foreign_key :clinic_workforce_export_batches, :clinic_workforce_export_batches, column: [:practice_id, :supersedes_batch_id], primary_key: [:practice_id, :id]
    add_check_constraint :clinic_workforce_payroll_configuration_versions, "provider = 'custom_file' AND revision > 0", name: "wf_payroll_provider"
    add_check_constraint :clinic_workforce_export_batches, "length(request_key) BETWEEN 8 AND 100 AND length(payload_digest) = 64 AND length(source_digest) = 64", name: "wf_export_keys"
    execute <<~SQL
      CREATE FUNCTION workforce_payroll_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Workforce payroll history is immutable'; END; $$;
      CREATE TRIGGER workforce_payroll_config_immutable BEFORE UPDATE OR DELETE ON clinic_workforce_payroll_configuration_versions
        FOR EACH ROW EXECUTE FUNCTION workforce_payroll_immutable();
      CREATE TRIGGER workforce_export_immutable BEFORE UPDATE OR DELETE ON clinic_workforce_export_batches
        FOR EACH ROW EXECUTE FUNCTION workforce_payroll_immutable();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve approved payroll export history"
  end
end
