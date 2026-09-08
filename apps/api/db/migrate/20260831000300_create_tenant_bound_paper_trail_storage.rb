class CreateTenantBoundPaperTrailStorage < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_model_versions do |t|
      t.bigint :practice_id, null: false
      t.string :item_type, null: false
      t.bigint :item_id, null: false
      t.string :event, null: false
      t.string :whodunnit
      t.string :actor_reference
      t.string :request_id
      t.string :causal_id
      t.string :job_id
      t.string :changed_fields, array: true, null: false, default: []
      t.column :occurred_at, "timestamp(6) with time zone", null: false
    end

    add_index :clinic_model_versions, [ :practice_id, :id ], unique: true, name: "clinic_model_versions_practice_id"
    add_foreign_key :clinic_model_versions, :clinic_practices, column: :practice_id, name: "fk_clinic_model_versions_practice"
    add_index :clinic_model_versions, [ :practice_id, :item_type, :item_id, :occurred_at, :id ], name: "clinic_model_versions_subject_time"
    add_index :clinic_model_versions, [ :practice_id, :request_id, :id ], name: "clinic_model_versions_request"
    add_check_constraint :clinic_model_versions, "length(trim(item_type)) > 0 AND length(trim(event)) > 0 AND event IN ('create','update','destroy','touch') AND (whodunnit IS NULL OR length(trim(whodunnit)) > 0) AND (actor_reference IS NULL OR length(trim(actor_reference)) > 0)", name: "clinic_model_versions_values"

    execute <<~SQL
      CREATE FUNCTION clinic_model_versions_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Model-change versions are append-only';
      END;
      $$;
      CREATE TRIGGER clinic_model_versions_immutable
        BEFORE UPDATE OR DELETE ON clinic_model_versions
        FOR EACH ROW EXECUTE FUNCTION clinic_model_versions_immutable();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve model-change history; restore a verified backup for rollback."
  end
end
