require "test_helper"

class PatientMembershipSchemaMigrationTest < ActiveSupport::TestCase
  MIGRATION = Rails.root.join("db/migrate/20260902002800_verify_patient_membership_schema.rb")
  require MIGRATION.to_s

  test "repairs an empty partial table including id and invariants" do
    connection.transaction do
      connection.execute("DROP TRIGGER clinic_patient_memberships_immutable ON public.clinic_patient_memberships")
      connection.execute("CREATE TEMP TABLE clinic_patient_memberships (practice_id bigint)")

      migration_027.up
      migration.up

      assert_equal [ "id" ], connection.primary_keys(:clinic_patient_memberships)
      assert_empty VerifyPatientMembershipSchema::REQUIRED_COLUMNS.keys.map(&:to_s) - connection.columns(:clinic_patient_memberships).map(&:name)
      assert_equal 3, connection.foreign_keys(:clinic_patient_memberships).length
      raise ActiveRecord::Rollback
    end
  end

  test "rejects a populated partial table without mutation" do
    connection.transaction do
      connection.execute("CREATE TEMP TABLE clinic_patient_memberships (id bigint PRIMARY KEY)")
      connection.execute("INSERT INTO clinic_patient_memberships (id) VALUES (1)")

      error = assert_raises(RuntimeError) { migration_027.up; migration.up }
      assert_includes error.message, "Unsafe partial patient membership schema"
      assert_equal [ "id" ], connection.columns(:clinic_patient_memberships).map(&:name)
      raise ActiveRecord::Rollback
    end
  end

  test "rejects unexpected populated columns and rolls back" do
    connection.transaction do
      connection.execute("ALTER TABLE clinic_patient_memberships ADD COLUMN synthetic_unexpected text")

      error = assert_raises(RuntimeError) { migration_027.up; migration.up }
      assert_includes error.message, "Unexpected patient membership columns"
      raise ActiveRecord::Rollback
    end

    assert_nil connection.columns(:clinic_patient_memberships).find { |column| column.name == "synthetic_unexpected" }
  end

  test "repairs wrong nullable direction on an empty table" do
    skip "test schema has membership rows" if connection.select_value("SELECT EXISTS (SELECT 1 FROM clinic_patient_memberships)")

    connection.transaction do
      connection.execute("ALTER TABLE clinic_patient_memberships ALTER COLUMN effective_until SET NOT NULL")
      migration_027.up
      migration.up
      assert connection.columns(:clinic_patient_memberships).find { |column| column.name == "effective_until" }.null
      raise ActiveRecord::Rollback
    end
  end

  test "repairs incompatible named index, check, and trigger on an empty table" do
    skip "test schema has membership rows" if connection.select_value("SELECT EXISTS (SELECT 1 FROM clinic_patient_memberships)")

    connection.transaction do
      connection.remove_index :clinic_patient_memberships, name: "clinic_patient_memberships_identity"
      connection.add_index :clinic_patient_memberships, :practice_id, name: "clinic_patient_memberships_identity"
      connection.remove_check_constraint :clinic_patient_memberships, name: "clinic_patient_memberships_status"
      connection.add_check_constraint :clinic_patient_memberships, "status IS NOT NULL", name: "clinic_patient_memberships_status"
      connection.execute("DROP TRIGGER clinic_patient_memberships_immutable ON clinic_patient_memberships")
      connection.execute("CREATE TRIGGER clinic_patient_memberships_immutable BEFORE INSERT ON clinic_patient_memberships FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()")

      migration_027.up
      migration.up

      index = connection.indexes(:clinic_patient_memberships).find { |candidate| candidate.name == "clinic_patient_memberships_identity" }
      assert_equal [ "practice_id", "patient_id", "version" ], index.columns
      status_check = connection.check_constraints(:clinic_patient_memberships).find { |candidate| candidate.name == "clinic_patient_memberships_status" }
      assert_equal VerifyPatientMembershipSchema::CHECKS.fetch("clinic_patient_memberships_status").fetch(:normalized),
        migration.send(:normalize_sql, status_check.expression)
      trigger_type = connection.select_value("SELECT tgtype FROM pg_trigger WHERE tgname='clinic_patient_memberships_immutable' AND tgrelid='clinic_patient_memberships'::regclass AND NOT tgisinternal")
      assert_equal 27, trigger_type.to_i
      raise ActiveRecord::Rollback
    end
  end

  private

  def connection
    ApplicationRecord.connection
  end

  def migration
    VerifyPatientMembershipSchema.new
  end

  def migration_027
    require Rails.root.join("db/migrate/20260902002700_reconcile_patient_membership_schema.rb").to_s
    ReconcilePatientMembershipSchema.new
  end
end
