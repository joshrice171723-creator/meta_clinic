class CreatePatientPortalWaitlistReplyReceipts < ActiveRecord::Migration[8.1]
  TABLE = :clinic_patient_portal_waitlist_reply_receipts

  def change
    create_table TABLE do |t|
      t.bigint :practice_id, null: false
      t.bigint :identity_id, null: false
      t.bigint :waitlist_entry_id, null: false
      t.string :request_key, null: false, limit: 160
      t.string :operation_code, null: false, limit: 160
      t.string :payload_digest, null: false, limit: 64
      t.string :digest_algorithm, null: false, limit: 32
      t.string :digest_key_id, null: false, limit: 120
      t.timestamps
    end

    add_index TABLE, %i[practice_id id], unique: true, name: "patient_portal_waitlist_reply_receipts_practice_id"
    add_index TABLE, %i[practice_id identity_id request_key], unique: true,
      name: "patient_portal_waitlist_reply_receipts_identity_key"
    add_index TABLE, %i[practice_id waitlist_entry_id created_at],
      name: "patient_portal_waitlist_reply_receipts_entry_time"
    add_foreign_key TABLE, :clinic_practices, column: :practice_id,
      name: "fk_patient_portal_waitlist_reply_receipts_practice"
    add_foreign_key TABLE, :clinic_patient_portal_identities, column: %i[practice_id identity_id],
      primary_key: %i[practice_id id], name: "fk_patient_portal_waitlist_reply_receipts_identity"
    add_foreign_key TABLE, :clinic_waitlist_entries, column: %i[practice_id waitlist_entry_id],
      primary_key: %i[practice_id id], name: "fk_patient_portal_waitlist_reply_receipts_entry"
    add_check_constraint TABLE, <<~SQL.squish, name: "patient_portal_waitlist_reply_receipts_values"
      operation_code IN ('patient_portal.waitlist.accept', 'patient_portal.waitlist.decline') AND
      length(trim(request_key)) BETWEEN 1 AND 160 AND
      payload_digest ~ '^[0-9a-f]{64}$' AND
      digest_algorithm = 'hmac-sha256-v1' AND
      length(trim(digest_key_id)) BETWEEN 1 AND 120
    SQL

    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER patient_portal_waitlist_reply_receipts_immutable
          BEFORE UPDATE OR DELETE ON #{TABLE}
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER IF EXISTS patient_portal_waitlist_reply_receipts_immutable ON #{TABLE}"
      end
    end
  end
end
