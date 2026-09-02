class VersionClinicOperationReceiptDigestKeys < ActiveRecord::Migration[8.1]
  LEGACY_HMAC_KEY_ID = "secret_key_base"

  def up
    add_column :clinic_operation_receipts, :digest_key_id, :string

    execute <<~SQL
      UPDATE clinic_operation_receipts
      SET digest_key_id = #{connection.quote(LEGACY_HMAC_KEY_ID)}
      WHERE digest_algorithm = 'hmac-sha256-v1'
    SQL

    add_check_constraint :clinic_operation_receipts, <<~SQL.squish,
      (digest_algorithm = 'sha256-v0' AND digest_key_id IS NULL)
      OR (digest_algorithm = 'hmac-sha256-v1' AND digest_key_id IS NOT NULL AND length(trim(digest_key_id)) > 0)
    SQL
      name: "clinic_operation_receipts_digest_key"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Receipt digest key identity is retained evidence and cannot be removed."
  end
end
