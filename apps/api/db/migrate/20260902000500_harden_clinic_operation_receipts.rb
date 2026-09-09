class HardenClinicOperationReceipts < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraint :clinic_operation_receipts, name: "clinic_operation_receipts_values"
    add_check_constraint :clinic_operation_receipts, <<~SQL.squish, name: "clinic_operation_receipts_values"
      length(trim(operation_code)) > 0
      AND length(trim(request_key)) > 0
      AND payload_digest ~ '^[0-9a-f]{64}$'
      AND outcome IN ('committed', 'outcome_unconfirmed')
      AND (resource_id IS NULL OR resource_id > 0)
    SQL

    execute <<~SQL
      CREATE FUNCTION clinic_operation_receipts_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'clinic operation receipts are append-only';
      END;
      $$;
      CREATE TRIGGER clinic_operation_receipts_immutable
      BEFORE UPDATE OR DELETE ON clinic_operation_receipts
      FOR EACH ROW EXECUTE FUNCTION clinic_operation_receipts_immutable();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Operation receipt immutability and unknown outcomes are retained as audit evidence."
  end
end
