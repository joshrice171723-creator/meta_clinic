class CreateClinicRecallEvents < ActiveRecord::Migration[8.1]
  def change
    add_index :clinic_encounter_follow_ups, %i[practice_id patient_id encounter_id id], unique: true,
      name: "clinic_encounter_follow_ups_context_id"

    create_table :clinic_recall_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :follow_up_id, null: false
      t.bigint :actor_membership_id, null: false
      t.string :event_type, null: false, limit: 32
      t.string :request_key, null: false, limit: 160
      t.string :previous_clinical_state, null: false, limit: 24
      t.string :resulting_clinical_state, null: false, limit: 24
      t.integer :source_version, null: false
      t.string :channel, limit: 24
      t.text :reason
      t.text :completion_evidence
      t.column :occurred_at, "timestamp(6) with time zone", null: false
      t.column :snoozed_until, "timestamp(6) with time zone"
      t.timestamps
    end

    add_index :clinic_recall_events, %i[practice_id id], unique: true,
      name: "clinic_recall_events_practice_id"
    add_index :clinic_recall_events, %i[practice_id patient_id follow_up_id occurred_at id],
      name: "clinic_recall_events_patient_history"
    add_index :clinic_recall_events, %i[practice_id follow_up_id source_version occurred_at id],
      name: "clinic_recall_events_projection"
    add_index :clinic_recall_events, %i[practice_id actor_membership_id request_key], unique: true,
      name: "clinic_recall_events_request"

    add_foreign_key :clinic_recall_events, :clinic_practices, column: :practice_id,
      name: "fk_recall_events_practice"
    add_foreign_key :clinic_recall_events, :clinic_encounter_follow_ups,
      column: %i[practice_id patient_id encounter_id follow_up_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_recall_events_follow_up"
    add_foreign_key :clinic_recall_events, :clinic_memberships,
      column: %i[practice_id actor_membership_id], primary_key: %i[practice_id id],
      name: "fk_recall_events_actor"

    add_check_constraint :clinic_recall_events,
      "event_type IN ('outreach_recorded','snoozed','excluded','completed','reopened') AND " \
      "previous_clinical_state IN ('needed','arranged','completed') AND " \
      "resulting_clinical_state IN ('needed','arranged','completed') AND source_version >= 0",
      name: "clinic_recall_events_states"
    add_check_constraint :clinic_recall_events,
      "(event_type = 'outreach_recorded' AND channel IS NOT NULL AND snoozed_until IS NULL AND completion_evidence IS NULL) OR " \
      "(event_type = 'snoozed' AND channel IS NULL AND snoozed_until IS NOT NULL AND reason IS NOT NULL AND completion_evidence IS NULL) OR " \
      "(event_type = 'excluded' AND channel IS NULL AND snoozed_until IS NULL AND reason IS NOT NULL AND completion_evidence IS NULL) OR " \
      "(event_type = 'completed' AND channel IS NULL AND snoozed_until IS NULL AND completion_evidence IS NOT NULL) OR " \
      "(event_type = 'reopened' AND channel IS NULL AND snoozed_until IS NULL AND reason IS NOT NULL AND completion_evidence IS NULL)",
      name: "clinic_recall_events_evidence"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER clinic_recall_events_immutable BEFORE UPDATE OR DELETE ON clinic_recall_events
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS clinic_recall_events_immutable ON clinic_recall_events"
      end
    end
  end
end
