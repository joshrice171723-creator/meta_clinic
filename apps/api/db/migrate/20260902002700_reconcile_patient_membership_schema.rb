class ReconcilePatientMembershipSchema < ActiveRecord::Migration[8.1]
  TABLE = :clinic_patient_memberships
  REQUIRED_COLUMNS = {
    practice_id: [ :bigint, false ], patient_id: [ :bigint, false ],
    recorded_by_membership_id: [ :bigint, false ], status: [ :string, false ],
    version: [ :integer, false ], effective_from: [ :datetime, false ], effective_until: [ :datetime, true ],
    created_at: [ :datetime, false ], updated_at: [ :datetime, false ]
  }.freeze

  def up
    return create_complete_table unless table_exists?(TABLE)

    reconcile_columns
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Patient membership history is retained as immutable evidence."
  end

  private

  def create_complete_table
    create_table TABLE do |t|
      t.bigint :practice_id, :patient_id, :recorded_by_membership_id, null: false
      t.string :status, null: false
      t.integer :version, null: false
      t.datetime :effective_from, null: false
      t.datetime :effective_until
      t.timestamps
    end
    add_invariants
  end

  def reconcile_columns
    existing_rows = connection.select_value("SELECT COUNT(*) FROM #{connection.quote_table_name(TABLE)}").to_i
    REQUIRED_COLUMNS.each do |name, (type, nullable)|
      column = connection.columns(TABLE).find { |candidate| candidate.name.to_sym == name }
      if column
        raise "Unsafe patient membership column type for #{name}." unless compatible_type?(column, type)
        if !nullable && column.null
          raise "Unsafe nullable patient membership column #{name} with existing rows." if existing_rows.positive?
          change_column_null TABLE, name, false
        end
        next
      end
      raise "Unsafe partial patient membership schema: missing #{name}." if existing_rows.positive?

      add_column TABLE, name, type, null: nullable
      connection.schema_cache.clear_data_source_cache!(TABLE.to_s)
    end
  end

  def add_invariants
    add_foreign_key TABLE, :clinic_practices, column: :practice_id, name: "fk_clinic_patient_memberships_practice" unless foreign_key_exists?(TABLE, :clinic_practices, name: "fk_clinic_patient_memberships_practice")
    add_foreign_key TABLE, :clinic_patients, column: [ :practice_id, :patient_id ], primary_key: [ :practice_id, :id ], name: "fk_patient_memberships_patient" unless foreign_key_exists?(TABLE, :clinic_patients, name: "fk_patient_memberships_patient")
    add_foreign_key TABLE, :clinic_memberships, column: [ :practice_id, :recorded_by_membership_id ], primary_key: [ :practice_id, :id ], name: "fk_patient_memberships_recorded_by" unless foreign_key_exists?(TABLE, :clinic_memberships, name: "fk_patient_memberships_recorded_by")
    add_index TABLE, [ :practice_id, :id ], unique: true, name: "clinic_patient_memberships_practice_id" unless index_exists?(TABLE, [ :practice_id, :id ], name: "clinic_patient_memberships_practice_id")
    add_index TABLE, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_patient_memberships_patient_id" unless index_exists?(TABLE, [ :practice_id, :patient_id, :id ], name: "clinic_patient_memberships_patient_id")
    add_index TABLE, [ :practice_id, :patient_id, :version ], unique: true, name: "clinic_patient_memberships_identity" unless index_exists?(TABLE, [ :practice_id, :patient_id, :version ], name: "clinic_patient_memberships_identity")
    add_check_constraint TABLE, "status IN ('member', 'nonmember')", name: "clinic_patient_memberships_status" unless check_constraint_exists?(TABLE, name: "clinic_patient_memberships_status")
    add_check_constraint TABLE, "version > 0 AND (effective_until IS NULL OR effective_until > effective_from)", name: "clinic_patient_memberships_window" unless check_constraint_exists?(TABLE, name: "clinic_patient_memberships_window")
    return if trigger_exists?("clinic_patient_memberships_immutable")

    execute <<~SQL
      CREATE TRIGGER clinic_patient_memberships_immutable
      BEFORE DELETE OR UPDATE ON clinic_patient_memberships
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def compatible_type?(column, expected)
    case expected
    when :bigint then column.sql_type == "bigint"
    when :integer then column.sql_type == "integer"
    when :string then column.sql_type == "character varying"
    when :datetime then column.sql_type.start_with?("timestamp")
    else false
    end
  end

  def trigger_exists?(name)
    connection.select_value(<<~SQL).present?
      SELECT 1 FROM pg_trigger
      WHERE tgname = #{connection.quote(name)} AND NOT tgisinternal
    SQL
  end
end
