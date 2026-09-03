class CreateClinicPatientMemberships < ActiveRecord::Migration[8.1]
  def change
    # The original unmerged local migration used a version later claimed by
    # the inventory work merged to main. Existing local synthetic databases
    # may therefore already have this table when the corrected version runs.
    return if table_exists?(:clinic_patient_memberships)

    create_tenant_table :clinic_patient_memberships do |t|
      t.bigint :patient_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.string :status, null: false
      t.integer :version, null: false
      t.datetime :effective_from, null: false
      t.datetime :effective_until
    end

    scoped_fk :clinic_patient_memberships, [ :practice_id, :patient_id ], :clinic_patients,
      [ :practice_id, :id ], "fk_patient_memberships_patient"
    scoped_fk :clinic_patient_memberships, [ :practice_id, :recorded_by_membership_id ], :clinic_memberships,
      [ :practice_id, :id ], "fk_patient_memberships_recorded_by"
    add_index :clinic_patient_memberships, [ :practice_id, :patient_id, :id ], unique: true,
      name: "clinic_patient_memberships_patient_id"
    add_index :clinic_patient_memberships, [ :practice_id, :patient_id, :version ], unique: true,
      name: "clinic_patient_memberships_identity"
    add_check_constraint :clinic_patient_memberships, "status IN ('member', 'nonmember')",
      name: "clinic_patient_memberships_status"
    add_check_constraint :clinic_patient_memberships,
      "version > 0 AND (effective_until IS NULL OR effective_until > effective_from)",
      name: "clinic_patient_memberships_window"

    execute <<~SQL
      CREATE TRIGGER clinic_patient_memberships_immutable
      BEFORE DELETE OR UPDATE ON clinic_patient_memberships
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  private

  def create_tenant_table(name)
    create_table name do |t|
      t.bigint :practice_id, null: false
      yield t
      t.timestamps
    end
    add_index name, [ :practice_id, :id ], unique: true, name: "#{name}_practice_id"
    add_foreign_key name, :clinic_practices, column: :practice_id, name: "fk_#{name}_practice"
  end

  def scoped_fk(table, columns, target, primary_key, name)
    add_foreign_key table, target, column: columns, primary_key: primary_key, name: name
  end
end
