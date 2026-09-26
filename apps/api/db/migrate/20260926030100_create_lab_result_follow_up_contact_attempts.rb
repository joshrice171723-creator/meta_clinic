class CreateLabResultFollowUpContactAttempts < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_lab_result_follow_up_contact_attempts do |t|
      t.bigint :practice_id, null: false
      t.bigint :follow_up_id, null: false
      t.bigint :clinical_task_id, null: false
      t.bigint :attempted_by_membership_id, null: false
      t.string :contact_method, null: false, limit: 24
      t.string :outcome, null: false, limit: 24
      t.column :attempted_at, "timestamp(6) with time zone", null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.text :note
      t.timestamps
    end

    add_index :clinic_lab_result_follow_up_contact_attempts, %i[practice_id id], unique: true,
      name: "lab_follow_up_contact_attempts_practice_id"
    add_index :clinic_lab_result_follow_up_contact_attempts, %i[practice_id request_key], unique: true,
      name: "lab_follow_up_contact_attempts_request_key"
    add_index :clinic_lab_result_follow_up_contact_attempts, %i[practice_id follow_up_id attempted_at id],
      name: "lab_follow_up_contact_attempts_history"

    add_foreign_key :clinic_lab_result_follow_up_contact_attempts, :clinic_practices,
      column: :practice_id, name: "fk_lab_contact_attempt_practice"
    add_foreign_key :clinic_lab_result_follow_up_contact_attempts, :clinic_lab_result_follow_ups,
      column: %i[practice_id follow_up_id], primary_key: %i[practice_id id],
      name: "fk_lab_contact_attempt_follow_up"
    add_foreign_key :clinic_lab_result_follow_up_contact_attempts, :clinic_clinical_tasks,
      column: %i[practice_id clinical_task_id], primary_key: %i[practice_id id],
      name: "fk_lab_contact_attempt_task"
    add_foreign_key :clinic_lab_result_follow_up_contact_attempts, :clinic_memberships,
      column: %i[practice_id attempted_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_lab_contact_attempt_actor"
    add_check_constraint :clinic_lab_result_follow_up_contact_attempts,
      "contact_method IN ('portal','phone','in_person','letter','other') AND " \
      "outcome IN ('informed','not_reached') AND char_length(trim(request_key)) BETWEEN 1 AND 160",
      name: "lab_follow_up_contact_attempt_values"
    execute <<~SQL
      CREATE TRIGGER lab_result_follow_up_contact_attempts_immutable
      BEFORE UPDATE OR DELETE ON clinic_lab_result_follow_up_contact_attempts
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end
end
