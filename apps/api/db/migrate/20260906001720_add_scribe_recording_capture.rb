class AddScribeRecordingCapture < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_scribe_recordings do |t|
      t.bigint :practice_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :created_by_id, null: false
      t.string :idempotency_key, null: false
      t.string :request_digest, null: false
      t.string :status, null: false, default: "recording"
      t.string :mime_type, null: false
      t.string :consent_policy_version, null: false
      t.datetime :consented_at, null: false
      t.integer :expected_encounter_version, null: false
      t.bigint :total_bytes, null: false, default: 0
      t.integer :total_chunks
      t.bigint :duration_ms
      t.datetime :completed_at
      t.datetime :interrupted_at
      t.datetime :cancelled_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    add_index :clinic_scribe_recordings, %i[practice_id id], unique: true, name: "scribe_recordings_practice_id"
    add_index :clinic_scribe_recordings, %i[practice_id encounter_id id], unique: true, name: "scribe_recordings_scope"
    add_index :clinic_scribe_recordings, %i[practice_id encounter_id status], name: "scribe_recordings_encounter_status"
    add_index :clinic_scribe_recordings, %i[practice_id idempotency_key], unique: true, name: "scribe_recordings_idempotency"
    add_foreign_key :clinic_scribe_recordings, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_recordings, :clinic_scribe_encounters,
      column: %i[practice_id encounter_id], primary_key: %i[practice_id id], name: "fk_scribe_recordings_encounter"
    add_foreign_key :clinic_scribe_recordings, :users, column: :created_by_id
    add_check_constraint :clinic_scribe_recordings,
      "status IN ('recording', 'interrupted', 'completed', 'cancelled') AND " \
        "mime_type IN ('audio/webm', 'audio/ogg', 'audio/mp4') AND " \
        "expected_encounter_version >= 0 AND total_bytes >= 0 AND " \
        "(total_chunks IS NULL OR total_chunks >= 0) AND (duration_ms IS NULL OR duration_ms >= 0) AND " \
        "length(trim(request_digest)) = 64",
      name: "scribe_recordings_values"

    create_table :clinic_scribe_recording_chunks do |t|
      t.bigint :practice_id, null: false
      t.bigint :recording_id, null: false
      t.integer :sequence, null: false
      t.string :status, null: false, default: "acknowledged"
      t.text :content
      t.string :content_digest, null: false
      t.integer :byte_size, null: false
      t.datetime :acknowledged_at, null: false
      t.timestamps
    end
    add_index :clinic_scribe_recording_chunks, %i[practice_id recording_id sequence], unique: true,
      name: "scribe_recording_chunks_sequence"
    add_foreign_key :clinic_scribe_recording_chunks, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_scribe_recording_chunks, :clinic_scribe_recordings,
      column: %i[practice_id recording_id], primary_key: %i[practice_id id], name: "fk_scribe_recording_chunks_recording"
    add_check_constraint :clinic_scribe_recording_chunks,
      "sequence >= 0 AND byte_size > 0 AND length(trim(content_digest)) = 64 AND " \
        "((status = 'acknowledged' AND content IS NOT NULL) OR (status = 'scrubbed' AND content IS NULL))",
      name: "scribe_recording_chunks_values"
  end
end
