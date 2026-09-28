class AddManualShipmentTracking < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_inventory_shipments, :carrier, :string, limit: 80
    add_column :clinic_inventory_shipments, :tracking_number, :string, limit: 120

    create_table :clinic_inventory_shipment_events do |t|
      t.bigint :practice_id, :shipment_id, :recorded_by_membership_id, null: false
      t.string :status, :request_key, :payload_digest, null: false
      t.text :note, null: false
      t.datetime :recorded_at, null: false
      t.timestamps
    end
    add_index :clinic_inventory_shipment_events, %i[practice_id request_key], unique: true,
      name: "inventory_shipment_events_retry"
    add_index :clinic_inventory_shipment_events, %i[practice_id shipment_id recorded_at id],
      name: "inventory_shipment_events_chronology"
    add_foreign_key :clinic_inventory_shipment_events, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_inventory_shipment_events, :clinic_inventory_shipments,
      column: %i[practice_id shipment_id], primary_key: %i[practice_id id],
      name: "inventory_shipment_event_context"
    add_foreign_key :clinic_inventory_shipment_events, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id],
      name: "inventory_shipment_event_actor"
    add_check_constraint :clinic_inventory_shipment_events,
      "status IN ('expected','in_transit','delayed','out_for_delivery','delivered','exception') AND " \
      "length(trim(note)) BETWEEN 1 AND 1000 AND length(trim(request_key)) BETWEEN 1 AND 160 AND " \
      "payload_digest ~ '^[0-9a-f]{64}$'",
      name: "inventory_shipment_event_values"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE TRIGGER inventory_shipment_events_immutable
          BEFORE UPDATE OR DELETE ON clinic_inventory_shipment_events
          FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()
        SQL
      end
      direction.down { execute "DROP TRIGGER inventory_shipment_events_immutable ON clinic_inventory_shipment_events" }
    end
  end
end
