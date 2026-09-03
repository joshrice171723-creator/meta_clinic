class AddShipmentAllocationEvidence < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_inventory_shipment_lines do |t|
      t.bigint :practice_id, :shipment_id, :purchase_order_line_id, null: false
      t.decimal :expected_packages, precision: 20, scale: 6, null: false
      t.timestamps
    end
    add_index :clinic_inventory_shipment_lines, [ :practice_id, :shipment_id, :purchase_order_line_id ], unique: true, name: "inventory_shipment_line_identity"
    add_foreign_key :clinic_inventory_shipment_lines, :clinic_practices, column: :practice_id
    add_foreign_key :clinic_inventory_shipment_lines, :clinic_inventory_shipments, column: [ :practice_id, :shipment_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_shipment_lines, :clinic_inventory_purchase_order_lines, column: [ :practice_id, :purchase_order_line_id ], primary_key: [ :practice_id, :id ]
    add_check_constraint :clinic_inventory_shipment_lines, "expected_packages > 0", name: "inventory_shipment_line_values"

    execute <<~SQL
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM clinic_inventory_shipments s
          LEFT JOIN clinic_inventory_purchase_order_lines pol ON pol.practice_id = s.practice_id AND pol.purchase_order_id = s.purchase_order_id
          GROUP BY s.id, s.practice_id
          HAVING COUNT(pol.id) <> 1
        ) THEN
          RAISE EXCEPTION 'Ambiguous historical shipment allocation requires reviewed evidence';
        END IF;
      END $$;
    SQL

    execute <<~SQL
      INSERT INTO clinic_inventory_shipment_lines (practice_id, shipment_id, purchase_order_line_id, expected_packages, created_at, updated_at)
      SELECT s.practice_id, s.id, line.id, s.package_count, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM clinic_inventory_shipments s
      JOIN LATERAL (
        SELECT pol.id FROM clinic_inventory_purchase_order_lines pol
        WHERE pol.practice_id = s.practice_id AND pol.purchase_order_id = s.purchase_order_id
        ORDER BY pol.id LIMIT 1
      ) line ON TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM clinic_inventory_shipment_lines existing WHERE existing.practice_id = s.practice_id AND existing.shipment_id = s.id
      )
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Shipment allocation evidence is retained as immutable workflow history."
  end
end
