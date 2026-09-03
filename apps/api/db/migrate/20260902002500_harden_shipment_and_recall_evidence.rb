class HardenShipmentAndRecallEvidence < ActiveRecord::Migration[8.1]
  def up
    add_check_constraint :clinic_inventory_shipment_lines, "expected_packages = trunc(expected_packages)", name: "inventory_shipment_line_whole_packages" unless check_constraint_exists?(:clinic_inventory_shipment_lines, name: "inventory_shipment_line_whole_packages")
    execute <<~SQL
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM clinic_inventory_shipments s
          JOIN clinic_inventory_shipment_lines sl ON sl.practice_id = s.practice_id AND sl.shipment_id = s.id
          JOIN clinic_inventory_purchase_order_lines pol ON pol.practice_id = sl.practice_id AND pol.id = sl.purchase_order_line_id
          GROUP BY s.id, s.expected_units
          HAVING SUM(sl.expected_packages * pol.conversion_factor) <> s.expected_units
        ) THEN
          RAISE EXCEPTION 'Shipment allocation does not match recorded expected units';
        END IF;
      END $$;
    SQL
    execute <<~SQL
      DO $$
      DECLARE original text; revised text;
      BEGIN
        SELECT pg_get_functiondef('inventory_evidence_link_guard()'::regprocedure) INTO original;
        revised := replace(original, 'NEW.actor_id IS DISTINCT FROM recall.actor_id OR ', '');
        IF revised = original THEN
          RAISE EXCEPTION 'Recall evidence guard definition was not recognized';
        END IF;
        EXECUTE revised;
      END $$;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Restore reviewed shipment and recall evidence guards."
  end
end
