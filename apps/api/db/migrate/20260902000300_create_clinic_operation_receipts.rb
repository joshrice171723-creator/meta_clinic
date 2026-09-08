class CreateClinicOperationReceipts < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_operation_receipts do |t|
      t.bigint :practice_id, null: false
      t.bigint :actor_membership_id, null: false
      t.string :operation_code, null: false
      t.string :request_key, null: false
      t.string :payload_digest, null: false
      t.string :outcome, null: false
      t.string :resource_type
      t.bigint :resource_id
      t.string :resource_version
      t.timestamps
    end

    add_index :clinic_operation_receipts, [ :practice_id, :id ], unique: true,
      name: "clinic_operation_receipts_practice_id"
    add_index :clinic_operation_receipts, [ :practice_id, :actor_membership_id, :request_key ], unique: true,
      name: "clinic_operation_receipts_identity"
    add_index :clinic_operation_receipts, [ :practice_id, :operation_code, :created_at ],
      name: "clinic_operation_receipts_operation_time"
    add_foreign_key :clinic_operation_receipts, :clinic_practices,
      column: :practice_id, name: "fk_operation_receipts_practice"
    add_foreign_key :clinic_operation_receipts, :clinic_memberships,
      column: [ :practice_id, :actor_membership_id ], primary_key: [ :practice_id, :id ],
      name: "fk_operation_receipts_actor_membership"
    add_check_constraint :clinic_operation_receipts, <<~SQL.squish, name: "clinic_operation_receipts_values"
      length(trim(operation_code)) > 0
      AND length(trim(request_key)) > 0
      AND payload_digest ~ '^[0-9a-f]{64}$'
      AND outcome IN ('committed')
      AND (resource_id IS NULL OR resource_id > 0)
    SQL
    add_check_constraint :clinic_operation_receipts, <<~SQL.squish, name: "clinic_operation_receipts_resource_pair"
      (resource_type IS NULL AND resource_id IS NULL)
      OR (resource_type IS NOT NULL AND resource_id IS NOT NULL)
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Operation receipts are retained audit evidence and cannot be dropped."
  end
end
