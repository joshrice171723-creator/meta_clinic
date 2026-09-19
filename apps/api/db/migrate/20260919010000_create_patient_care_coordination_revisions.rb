class CreatePatientCareCoordinationRevisions < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_patient_care_coordination_revisions do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :recorded_by_membership_id, null: false
      t.integer :revision, null: false
      t.text :content, null: false
      t.string :request_key, null: false, limit: 160
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.timestamps
    end

    add_index :clinic_patient_care_coordination_revisions, %i[practice_id id],
      unique: true, name: "patient_coordination_practice_id"
    add_index :clinic_patient_care_coordination_revisions, %i[practice_id patient_id revision],
      unique: true, name: "patient_coordination_revision"
    add_index :clinic_patient_care_coordination_revisions, %i[practice_id recorded_by_membership_id request_key],
      unique: true, name: "patient_coordination_request"
    add_foreign_key :clinic_patient_care_coordination_revisions, :clinic_practices,
      column: :practice_id, name: "fk_patient_coordination_practice"
    add_foreign_key :clinic_patient_care_coordination_revisions, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id],
      name: "fk_patient_coordination_patient"
    add_foreign_key :clinic_patient_care_coordination_revisions, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_patient_coordination_recorder"
    add_check_constraint :clinic_patient_care_coordination_revisions,
      "revision > 0 AND length(trim(request_key)) BETWEEN 1 AND 160 AND length(content) > 0",
      name: "patient_coordination_values"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_patient_care_coordination_revisions_immutable
          BEFORE UPDATE OR DELETE ON clinic_patient_care_coordination_revisions
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_patient_care_coordination_revisions_immutable ON clinic_patient_care_coordination_revisions"
      end
    end
  end
end
