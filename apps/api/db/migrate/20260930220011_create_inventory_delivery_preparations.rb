class CreateInventoryDeliveryPreparations < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_inventory_delivery_preparations do |t|
      t.bigint :practice_id, :purchase_order_id, :actor_id, null: false
      t.integer :order_version, null: false
      t.uuid :attempt_id, :correlation_id, null: false
      t.string :request_key, :intent_digest, :source_digest, null: false
      t.string :status, null: false, default: "prepared"
      t.string :connection_status, null: false, default: "disconnected"
      t.string :delivery_outcome, null: false, default: "unknown"
      t.string :source, null: false, default: "local_preparation"
      t.string :reason, limit: 200, null: false
      t.jsonb :snapshot, null: false
      t.datetime :prepared_at, null: false
      t.timestamps
    end
    table = :clinic_inventory_delivery_preparations
    add_index table, [ :practice_id, :request_key ], unique: true, name: "inventory_delivery_preparation_request"
    add_index table, [ :practice_id, :purchase_order_id, :order_version ], unique: true, name: "inventory_delivery_preparation_version"
    add_index table, :attempt_id, unique: true
    add_foreign_key table, :clinic_practices, column: :practice_id
    add_foreign_key table, :clinic_inventory_purchase_orders, column: [ :practice_id, :purchase_order_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key table, :clinic_memberships, column: [ :practice_id, :actor_id ], primary_key: [ :practice_id, :user_id ]
    add_check_constraint table,
      "order_version > 0 AND request_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND " \
      "intent_digest ~ '^[0-9a-f]{64}$' AND source_digest ~ '^[0-9a-f]{64}$' AND " \
      "status = 'prepared' AND connection_status = 'disconnected' AND delivery_outcome = 'unknown' AND source = 'local_preparation' AND " \
      "length(trim(reason)) BETWEEN 1 AND 200 AND jsonb_typeof(snapshot) = 'object'",
      name: "inventory_delivery_preparation_values"
    execute "CREATE TRIGGER inventory_delivery_preparation_immutable BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION inventory_immutable()"
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve immutable delivery preparation evidence."
  end
end
