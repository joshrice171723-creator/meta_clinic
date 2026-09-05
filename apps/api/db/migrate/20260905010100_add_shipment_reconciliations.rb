class AddShipmentReconciliations < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_inventory_shipment_reconciliations do |t|
      t.bigint :practice_id, :shipment_id, :actor_id, :profile_id, null: false
      t.bigint :receipt_id
      t.decimal :accepted_packages, :missing_packages, :rejected_packages, :excess_packages, precision: 20, scale: 6, null: false
      t.string :exception, :reason, :request_key, :payload_digest, null: false
      t.jsonb :observations, null: false, default: []
      t.timestamps
    end
    add_index :clinic_inventory_shipment_reconciliations, [ :practice_id, :shipment_id ], unique: true, name: "inventory_shipment_reconciliation_once"
    add_index :clinic_inventory_shipment_reconciliations, [ :practice_id, :request_key ], unique: true, name: "inventory_shipment_reconciliation_retry"
    add_foreign_key :clinic_inventory_shipment_reconciliations, :clinic_inventory_shipments, column: [ :practice_id, :shipment_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_shipment_reconciliations, :clinic_inventory_receipts, column: [ :practice_id, :receipt_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_shipment_reconciliations, :clinic_inventory_profiles, column: [ :practice_id, :profile_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_inventory_shipment_reconciliations, :clinic_memberships, column: [ :practice_id, :actor_id ], primary_key: [ :practice_id, :user_id ]
    add_check_constraint :clinic_inventory_shipment_reconciliations, %w[accepted_packages missing_packages rejected_packages excess_packages].map { |field| "#{field} BETWEEN 0 AND 1000000 AND #{field}=trunc(#{field})" }.join(" AND "), name: "inventory_reconciliation_quantities"
    add_check_constraint :clinic_inventory_shipment_reconciliations, "missing_packages + rejected_packages + excess_packages > 0 AND ((accepted_packages=0 AND receipt_id IS NULL) OR (accepted_packages>0 AND receipt_id IS NOT NULL))", name: "inventory_reconciliation_shape"
    add_check_constraint :clinic_inventory_shipment_reconciliations, "exception IN ('short_delivery','damaged','wrong_item','wrong_lot','temperature','expiry','excess','other') AND length(trim(reason)) BETWEEN 1 AND 200 AND length(request_key)=36 AND length(payload_digest)=64", name: "inventory_reconciliation_reason"
    add_check_constraint :clinic_inventory_shipment_reconciliations, "jsonb_typeof(observations)='array' AND jsonb_array_length(observations) BETWEEN 1 AND 100 AND octet_length(observations::text)<=64000", name: "inventory_reconciliation_observations"
    execute <<~SQL
      CREATE FUNCTION inventory_reconciliation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE delivery clinic_inventory_shipments%ROWTYPE;
      BEGIN
        NEW.profile_id := inventory_authorize(NEW.practice_id,NEW.actor_id,'receive',NEW.profile_id);
        SELECT * INTO delivery FROM clinic_inventory_shipments WHERE id=NEW.shipment_id AND practice_id=NEW.practice_id FOR UPDATE;
        IF NOT FOUND OR delivery.status<>'delivered' OR NEW.accepted_packages+NEW.missing_packages+NEW.rejected_packages<>delivery.package_count
        THEN RAISE EXCEPTION 'Reconciliation must balance the delivered shipment'; END IF;
        IF NOT EXISTS (SELECT 1 FROM clinic_inventory_shipment_lines allocation
          JOIN clinic_inventory_purchase_order_lines line ON line.id=allocation.purchase_order_line_id AND line.practice_id=allocation.practice_id
          WHERE allocation.shipment_id=delivery.id AND allocation.practice_id=delivery.practice_id
            AND line.purchase_order_id=delivery.purchase_order_id AND allocation.expected_packages=delivery.package_count
            AND allocation.expected_packages*line.conversion_factor=delivery.expected_units)
        THEN RAISE EXCEPTION 'Reconciliation requires verified shipment allocation'; END IF;
        IF NEW.receipt_id IS NULL THEN
          IF EXISTS (SELECT 1 FROM clinic_inventory_receipts WHERE shipment_id=delivery.id)
          THEN RAISE EXCEPTION 'Shipment already has a receipt'; END IF;
        ELSIF NOT EXISTS (SELECT 1 FROM clinic_inventory_receipts WHERE id=NEW.receipt_id AND practice_id=NEW.practice_id AND shipment_id=delivery.id AND purchase_order_id=delivery.purchase_order_id AND actor_id=NEW.actor_id)
        THEN RAISE EXCEPTION 'Reconciliation must match its receipt'; END IF;
        RETURN NEW;
      END $$;
      CREATE FUNCTION inventory_reconciliation_complete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.receipt_id IS NOT NULL AND NEW.accepted_packages IS DISTINCT FROM
          (SELECT sum(input_quantity) FROM clinic_inventory_receipt_lines WHERE receipt_id=NEW.receipt_id AND practice_id=NEW.practice_id AND input_unit='package')
        THEN RAISE EXCEPTION 'Reconciliation accepted packages must match receipt postings'; END IF;
        IF EXISTS (SELECT 1 FROM clinic_inventory_receipt_lines line WHERE line.receipt_id=NEW.receipt_id AND NOT EXISTS
          (SELECT 1 FROM clinic_inventory_shipment_lines allocation WHERE allocation.shipment_id=NEW.shipment_id
            AND allocation.practice_id=NEW.practice_id AND allocation.purchase_order_line_id=line.purchase_order_line_id))
        THEN RAISE EXCEPTION 'Reconciliation receipt lines must match shipment allocation'; END IF;
        RETURN NULL;
      END $$;
      CREATE FUNCTION inventory_receipt_open_shipment() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.shipment_id IS NOT NULL THEN
          PERFORM 1 FROM clinic_inventory_shipments WHERE id=NEW.shipment_id FOR UPDATE;
          IF EXISTS (SELECT 1 FROM clinic_inventory_shipment_reconciliations WHERE shipment_id=NEW.shipment_id)
          THEN RAISE EXCEPTION 'Shipment already reconciled'; END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER inventory_reconciliation_guard BEFORE INSERT ON clinic_inventory_shipment_reconciliations FOR EACH ROW EXECUTE FUNCTION inventory_reconciliation_guard();
      CREATE CONSTRAINT TRIGGER inventory_reconciliation_complete AFTER INSERT ON clinic_inventory_shipment_reconciliations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_reconciliation_complete();
      CREATE TRIGGER inventory_receipt_open_shipment BEFORE INSERT ON clinic_inventory_receipts FOR EACH ROW EXECUTE FUNCTION inventory_receipt_open_shipment();
    SQL
    %w[clinic_inventory_shipment_reconciliations clinic_inventory_shipments clinic_inventory_shipment_lines].each do |table|
      execute "CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION inventory_immutable()"
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Shipment inspection and rejection evidence must be retained."
  end
end
