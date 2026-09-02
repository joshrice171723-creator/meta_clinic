class UpgradeClinicOperationReceiptDigests < ActiveRecord::Migration[8.1]
  def up
    # Existing synthetic evidence remains interpretable as the unkeyed legacy
    # format. New application writes explicitly select hmac-sha256-v1.
    add_column :clinic_operation_receipts, :digest_algorithm, :string,
      null: false, default: "sha256-v0"
    change_column_default :clinic_operation_receipts, :digest_algorithm, from: "sha256-v0", to: nil
    add_check_constraint :clinic_operation_receipts,
      "digest_algorithm IN ('sha256-v0', 'hmac-sha256-v1')",
      name: "clinic_operation_receipts_digest_algorithm"
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Receipt digest algorithm evidence is retained and cannot be removed."
  end
end
