# Inventory management is additive to the APPly inventory foundation.
class AddInventoryManagementWorkflows < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_inventory_purchase_orders do |t|
      t.bigint :practice_id, :actor_id, null: false
      t.bigint :supplier_id
      t.string :number, :status, :destination, :reason, :request_key, :payload_digest, null: false
      t.integer :version, null: false, default: 1
      t.decimal :subtotal, :tax, :shipping, :total, precision: 20, scale: 6, null: false, default: 0
      t.timestamps
    end
    tenant_key(:clinic_inventory_purchase_orders)
    actor_key(:clinic_inventory_purchase_orders)
    scoped_fk(:clinic_inventory_purchase_orders, :supplier_id, :clinic_inventory_suppliers)
    add_index :clinic_inventory_purchase_orders, %i[practice_id number], unique: true, name: "inventory_purchase_order_identity"
    add_index :clinic_inventory_purchase_orders, %i[practice_id request_key], unique: true, name: "inventory_purchase_order_retry"
    add_check_constraint :clinic_inventory_purchase_orders, "status IN ('draft','submitted','approved','rejected','sent','partially_received','complete','cancelled') AND version > 0 AND subtotal >= 0 AND tax >= 0 AND shipping >= 0 AND total >= 0 AND length(trim(number)) BETWEEN 1 AND 80 AND length(trim(destination)) BETWEEN 1 AND 120 AND length(trim(reason)) BETWEEN 1 AND 200", name: "inventory_purchase_order_values"

    create_table :clinic_inventory_purchase_order_lines do |t|
      t.bigint :practice_id, :purchase_order_id, :product_id, null: false
      t.string :product_name, :stock_unit, :input_unit, null: false
      t.decimal :ordered_quantity, :received_quantity, :conversion_factor, :unit_price, precision: 20, scale: 6, null: false
      t.string :currency
      t.timestamps
    end
    tenant_key(:clinic_inventory_purchase_order_lines)
    scoped_fk(:clinic_inventory_purchase_order_lines, :purchase_order_id, :clinic_inventory_purchase_orders)
    scoped_fk(:clinic_inventory_purchase_order_lines, :product_id, :clinic_pharmacy_products)
    add_index :clinic_inventory_purchase_order_lines, %i[purchase_order_id id], name: "inventory_purchase_order_line_order"
    add_check_constraint :clinic_inventory_purchase_order_lines, "ordered_quantity > 0 AND received_quantity BETWEEN 0 AND ordered_quantity AND conversion_factor > 0 AND unit_price >= 0 AND length(trim(product_name)) BETWEEN 1 AND 160 AND length(trim(stock_unit)) BETWEEN 1 AND 20 AND length(trim(input_unit)) BETWEEN 1 AND 20", name: "inventory_purchase_order_line_values"

    create_table :clinic_inventory_purchase_order_events do |t|
      t.bigint :practice_id, :purchase_order_id, :actor_id, null: false
      t.string :from_status, :to_status, :reason, :request_key, null: false
      t.timestamps
    end
    tenant_key(:clinic_inventory_purchase_order_events)
    actor_key(:clinic_inventory_purchase_order_events)
    scoped_fk(:clinic_inventory_purchase_order_events, :purchase_order_id, :clinic_inventory_purchase_orders)
    add_index :clinic_inventory_purchase_order_events, %i[practice_id request_key], unique: true, name: "inventory_purchase_order_event_retry"
    add_check_constraint :clinic_inventory_purchase_order_events, "length(trim(reason)) BETWEEN 1 AND 200 AND length(trim(request_key)) BETWEEN 1 AND 100", name: "inventory_purchase_order_event_values"

    create_table :clinic_inventory_shipments do |t|
      t.bigint :practice_id, :purchase_order_id, :actor_id, null: false
      t.string :reference, :supplier_reference, :status, :request_key, :payload_digest, null: false
      t.integer :package_count, null: false
      t.decimal :expected_units, precision: 20, scale: 6, null: false
      t.datetime :delivered_at
      t.timestamps
    end
    tenant_key(:clinic_inventory_shipments)
    actor_key(:clinic_inventory_shipments)
    scoped_fk(:clinic_inventory_shipments, :purchase_order_id, :clinic_inventory_purchase_orders)
    add_index :clinic_inventory_shipments, %i[practice_id reference], unique: true, name: "inventory_shipment_identity"
    add_index :clinic_inventory_shipments, %i[practice_id request_key], unique: true, name: "inventory_shipment_retry"
    add_check_constraint :clinic_inventory_shipments, "status IN ('expected','delivered','received','exception') AND package_count > 0 AND expected_units > 0 AND length(trim(reference)) BETWEEN 1 AND 80 AND length(trim(supplier_reference)) BETWEEN 1 AND 120", name: "inventory_shipment_values"

    create_table :clinic_inventory_transfers do |t|
      t.bigint :practice_id, :source_batch_id, :destination_batch_id, :actor_id, null: false
      t.decimal :quantity, precision: 20, scale: 6, null: false
      t.string :reason, :request_key, null: false
      t.timestamps
    end
    tenant_key(:clinic_inventory_transfers)
    actor_key(:clinic_inventory_transfers)
    scoped_fk(:clinic_inventory_transfers, :source_batch_id, :clinic_pharmacy_batches)
    scoped_fk(:clinic_inventory_transfers, :destination_batch_id, :clinic_pharmacy_batches)
    add_index :clinic_inventory_transfers, %i[practice_id request_key], unique: true, name: "inventory_transfer_retry"
    add_check_constraint :clinic_inventory_transfers, "quantity > 0 AND length(trim(reason)) BETWEEN 1 AND 200 AND length(trim(request_key)) BETWEEN 1 AND 100 AND source_batch_id <> destination_batch_id", name: "inventory_transfer_values"

    create_table :clinic_inventory_recalls do |t|
      t.bigint :practice_id, :product_id, :actor_id, null: false
      t.string :reference, :status, :reason, :required_disposition, :request_key, :payload_digest, null: false
      t.date :effective_on, null: false
      t.decimal :affected_units, precision: 20, scale: 6, null: false, default: 0
      t.timestamps
    end
    tenant_key(:clinic_inventory_recalls)
    actor_key(:clinic_inventory_recalls)
    scoped_fk(:clinic_inventory_recalls, :product_id, :clinic_pharmacy_products)
    add_index :clinic_inventory_recalls, %i[practice_id reference], unique: true, name: "inventory_recall_identity"
    add_index :clinic_inventory_recalls, %i[practice_id request_key], unique: true, name: "inventory_recall_retry"
    add_check_constraint :clinic_inventory_recalls, "status IN ('identified','inventory_locked','location_sweep','isolated','disposition_pending','disposition_complete','closed') AND affected_units >= 0 AND length(trim(reference)) BETWEEN 1 AND 100 AND length(trim(reason)) BETWEEN 1 AND 200 AND length(trim(required_disposition)) BETWEEN 1 AND 80", name: "inventory_recall_values"

    create_table :clinic_inventory_recall_lots do |t|
      t.bigint :practice_id, :recall_id, :lot_id, null: false
      t.timestamps
    end
    tenant_key(:clinic_inventory_recall_lots)
    scoped_fk(:clinic_inventory_recall_lots, :recall_id, :clinic_inventory_recalls)
    scoped_fk(:clinic_inventory_recall_lots, :lot_id, :clinic_inventory_lots)
    add_index :clinic_inventory_recall_lots, %i[practice_id recall_id lot_id], unique: true, name: "inventory_recall_lot_identity"

    create_table :clinic_inventory_recall_dispositions do |t|
      t.bigint :practice_id, :recall_id, :batch_id, :actor_id, null: false
      t.decimal :quantity, precision: 20, scale: 6, null: false
      t.string :method, :evidence_reference, :reason, :request_key, null: false
      t.timestamps
    end
    tenant_key(:clinic_inventory_recall_dispositions)
    actor_key(:clinic_inventory_recall_dispositions)
    scoped_fk(:clinic_inventory_recall_dispositions, :recall_id, :clinic_inventory_recalls)
    scoped_fk(:clinic_inventory_recall_dispositions, :batch_id, :clinic_pharmacy_batches)
    add_index :clinic_inventory_recall_dispositions, %i[practice_id request_key], unique: true, name: "inventory_disposition_retry"
    add_check_constraint :clinic_inventory_recall_dispositions, "quantity > 0 AND length(trim(method)) BETWEEN 1 AND 60 AND length(trim(evidence_reference)) BETWEEN 1 AND 200 AND length(trim(reason)) BETWEEN 1 AND 200 AND length(trim(request_key)) BETWEEN 1 AND 100", name: "inventory_disposition_values"

    create_table :clinic_inventory_control_reviews do |t|
      t.bigint :practice_id, :count_id, :actor_id, null: false
      t.string :kind, :reason, :request_key, null: false
      t.timestamps
    end
    tenant_key(:clinic_inventory_control_reviews)
    actor_key(:clinic_inventory_control_reviews)
    scoped_fk(:clinic_inventory_control_reviews, :count_id, :clinic_inventory_counts)
    add_index :clinic_inventory_control_reviews, %i[practice_id count_id kind], unique: true, name: "inventory_control_review_kind"
    add_index :clinic_inventory_control_reviews, %i[practice_id request_key], unique: true, name: "inventory_control_review_retry"
    add_check_constraint :clinic_inventory_control_reviews, "kind IN ('investigation','certification') AND length(trim(reason)) BETWEEN 1 AND 200 AND length(trim(request_key)) BETWEEN 1 AND 100", name: "inventory_control_review_values"

    add_column :clinic_inventory_receipts, :purchase_order_id, :bigint
    add_column :clinic_inventory_receipts, :shipment_id, :bigint
    add_column :clinic_inventory_receipts, :status, :string, null: false, default: "received"
    add_foreign_key :clinic_inventory_receipts, :clinic_inventory_purchase_orders, column: %i[practice_id purchase_order_id], primary_key: %i[practice_id id]
    add_foreign_key :clinic_inventory_receipts, :clinic_inventory_shipments, column: %i[practice_id shipment_id], primary_key: %i[practice_id id]
    add_index :clinic_inventory_receipts, %i[practice_id purchase_order_id]
    add_check_constraint :clinic_inventory_receipts, "status IN ('received','quarantined','exception')", name: "inventory_receipt_status"
    add_column :clinic_inventory_receipt_lines, :purchase_order_line_id, :bigint
    add_column :clinic_inventory_receipt_lines, :area_id, :string
    add_column :clinic_inventory_receipt_lines, :temperature_c, :decimal, precision: 8, scale: 2
    add_column :clinic_inventory_receipt_lines, :exception, :string
    add_column :clinic_inventory_receipt_lines, :disposition, :string
    add_foreign_key :clinic_inventory_receipt_lines, :clinic_inventory_purchase_order_lines, column: %i[practice_id purchase_order_line_id], primary_key: %i[practice_id id]

    %w[clinic_inventory_purchase_order_events clinic_inventory_transfers clinic_inventory_recall_lots clinic_inventory_recall_dispositions clinic_inventory_control_reviews].each do |table|
      execute "CREATE TRIGGER #{table}_immutable BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION inventory_immutable()"
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve inventory workflow evidence; restore a reviewed backup instead."
  end

  private

  def tenant_key(table)
    add_index table, %i[practice_id id], unique: true
    add_foreign_key table, :clinic_practices, column: :practice_id
  end

  def scoped_fk(table, column, target)
    add_foreign_key table, target, column: [ :practice_id, column ], primary_key: [ :practice_id, :id ]
  end

  def actor_key(table)
    add_foreign_key table, :clinic_memberships, column: %i[practice_id actor_id], primary_key: %i[practice_id user_id]
  end
end
