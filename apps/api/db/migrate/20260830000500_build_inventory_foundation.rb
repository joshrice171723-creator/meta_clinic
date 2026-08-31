class BuildInventoryFoundation < ActiveRecord::Migration[8.1]
  def up
    raise "PostgreSQL is required" unless connection.adapter_name == "PostgreSQL"
    add_column :clinic_practices, :timezone, :string, null: false, default: "UTC"
    %w[catalog receive adjust hold release count configure].each do |action|
      add_column :clinic_memberships, "inventory_#{action}", :boolean, null: false, default: false
      execute "UPDATE clinic_memberships SET inventory_#{action} = inventory_access"
    end
    add_index :clinic_items, [ :practice_id, :id ], unique: true
    add_foreign_key :clinic_notes, :clinic_memberships, column: [ :practice_id, :author_id ], primary_key: [ :practice_id, :user_id ]
    create_table :clinic_inventory_profiles do |t|
      t.bigint :practice_id, null: false
      t.integer :version, null: false
      t.string :status, null: false, default: "synthetic"
      t.string :capabilities, array: true, null: false, default: [ "inventory" ]
      t.string :operator_reference
      t.bigint :actor_id
      t.string :reason, null: false
      t.timestamps
    end
    tenant_key :clinic_inventory_profiles
    actor_key :clinic_inventory_profiles
    add_index :clinic_inventory_profiles, [ :practice_id, :version ], unique: true
    add_check_constraint :clinic_inventory_profiles, "version > 0 AND status IN ('draft','synthetic','suspended','retired') AND capabilities <@ ARRAY['inventory']::varchar[]", name: "inventory_profile_scope"
    execute "INSERT INTO clinic_inventory_profiles (practice_id, version, reason, created_at, updated_at) SELECT id, 1, 'Synthetic inventory baseline; no clinical authority', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM clinic_practices"

    %w[locations suppliers].each do |kind|
      table = "clinic_inventory_#{kind}"
      create_table table do |t|
        t.bigint :practice_id, null: false
        t.string :name, null: false
        t.timestamps
      end
      tenant_key table
      add_index table, [ :practice_id, :name ], unique: true
    end
    add_column :clinic_pharmacy_products, :stock_unit, :string, null: false, default: "package"
    add_column :clinic_pharmacy_products, :quantity_scale, :integer, null: false, default: 0
    add_column :clinic_pharmacy_products, :package_size, :decimal, null: false, default: 1
    add_column :clinic_pharmacy_products, :unit_reference, :string
    add_check_constraint :clinic_pharmacy_products, "stock_unit IN ('package','each','tablet','capsule','vial','mL','g') AND quantity_scale BETWEEN 0 AND 6 AND (stock_unit IN ('mL','g') OR quantity_scale = 0) AND package_size > 0 AND package_size <= 1000000 AND package_size = round(package_size, quantity_scale) AND (package_size = 1 OR length(trim(unit_reference)) > 0)", name: "inventory_product_units"
    create_table :clinic_inventory_lots do |t|
      t.bigint :practice_id, :product_id, null: false
      t.string :number, null: false
      t.date :expires_on, null: false
      t.string :expiry_precision, null: false, default: "day"
      t.timestamps
    end
    tenant_key :clinic_inventory_lots
    scoped_fk :clinic_inventory_lots, :product_id, :clinic_pharmacy_products
    add_index :clinic_inventory_lots, [ :practice_id, :product_id, :number ], unique: true, name: "inventory_lot_identity"
    add_check_constraint :clinic_inventory_lots, "expiry_precision IN ('day','month')", name: "inventory_expiry_precision"
    add_column :clinic_pharmacy_batches, :lot_id, :bigint
    add_column :clinic_pharmacy_batches, :location_id, :bigint
    add_column :clinic_pharmacy_batches, :on_hand, :decimal, null: false, default: 0
    execute <<~SQL
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM clinic_pharmacy_batches GROUP BY practice_id, product_id, lot_number HAVING COUNT(DISTINCT expires_on) > 1) THEN
          RAISE EXCEPTION 'Legacy lot expiry conflict; reconcile before migration';
        END IF;
      END $$;
      INSERT INTO clinic_inventory_locations (practice_id,name,created_at,updated_at)
        SELECT DISTINCT practice_id,location,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM clinic_pharmacy_batches;
      INSERT INTO clinic_inventory_lots (practice_id,product_id,number,expires_on,created_at,updated_at)
        SELECT practice_id,product_id,lot_number,MIN(expires_on),MIN(created_at),MIN(created_at)
        FROM clinic_pharmacy_batches GROUP BY practice_id,product_id,lot_number;
      UPDATE clinic_pharmacy_batches b SET lot_id=l.id FROM clinic_inventory_lots l
        WHERE l.practice_id=b.practice_id AND l.product_id=b.product_id AND l.number=b.lot_number;
      UPDATE clinic_pharmacy_batches b SET location_id=l.id FROM clinic_inventory_locations l
        WHERE l.practice_id=b.practice_id AND l.name=b.location;
      UPDATE clinic_pharmacy_batches b SET on_hand=(SELECT COALESCE(SUM(quantity),0) FROM clinic_pharmacy_movements m WHERE m.batch_id=b.id);
    SQL
    change_column_null :clinic_pharmacy_batches, :lot_id, false
    change_column_null :clinic_pharmacy_batches, :location_id, false
    scoped_fk :clinic_pharmacy_batches, :lot_id, :clinic_inventory_lots
    scoped_fk :clinic_pharmacy_batches, :location_id, :clinic_inventory_locations
    add_check_constraint :clinic_pharmacy_batches, "on_hand BETWEEN 0 AND 1000000", name: "inventory_position_balance"

    create_table :clinic_inventory_receipts do |t|
      t.bigint :practice_id, :actor_id, :profile_id, null: false
      t.bigint :supplier_id
      t.datetime :received_at, null: false
      t.string :invoice_reference
      t.string :request_key, :payload_digest, :reason, null: false
      t.timestamps
    end
    tenant_key :clinic_inventory_receipts
    actor_key :clinic_inventory_receipts
    scoped_fk :clinic_inventory_receipts, :profile_id, :clinic_inventory_profiles
    scoped_fk :clinic_inventory_receipts, :supplier_id, :clinic_inventory_suppliers
    add_index :clinic_inventory_receipts, [ :practice_id, :request_key ], unique: true, name: "inventory_receipt_retry"
    create_table :clinic_inventory_receipt_lines do |t|
      t.bigint :practice_id, :receipt_id, :batch_id, null: false
      t.decimal :input_quantity, :conversion_factor, :quantity, null: false
      t.string :input_unit, :stock_unit, null: false
      t.decimal :unit_cost
      t.string :currency
      t.timestamps
    end
    tenant_key :clinic_inventory_receipt_lines
    scoped_fk :clinic_inventory_receipt_lines, :receipt_id, :clinic_inventory_receipts
    scoped_fk :clinic_inventory_receipt_lines, :batch_id, :clinic_pharmacy_batches
    add_check_constraint :clinic_inventory_receipt_lines, "input_quantity > 0 AND input_quantity <= 1000000 AND conversion_factor > 0 AND conversion_factor <= 1000000 AND quantity = input_quantity * conversion_factor AND quantity > 0 AND quantity <= 1000000 AND quantity = round(quantity,6)", name: "inventory_receipt_conversion"
    add_check_constraint :clinic_inventory_receipt_lines, "(unit_cost IS NULL AND currency IS NULL) OR (unit_cost IS NOT NULL AND currency ~ '^[A-Z]{3}$' AND unit_cost BETWEEN 0 AND 1000000000 AND unit_cost = round(unit_cost,6))", name: "inventory_receipt_cost"

    create_table :clinic_inventory_entries do |t|
      t.bigint :practice_id, null: false
      t.bigint :actor_id, :batch_id, :item_id, :receipt_line_id, :profile_id, :legacy_id
      t.string :stock_type, :kind, :reason, :request_key, :stock_unit, null: false
      t.string :origin, null: false, default: "posted"
      t.decimal :quantity, null: false
      t.datetime :occurred_at, null: false
      t.timestamps
    end
    tenant_key :clinic_inventory_entries
    actor_key :clinic_inventory_entries
    scoped_fk :clinic_inventory_entries, :batch_id, :clinic_pharmacy_batches
    scoped_fk :clinic_inventory_entries, :item_id, :clinic_items
    scoped_fk :clinic_inventory_entries, :receipt_line_id, :clinic_inventory_receipt_lines
    scoped_fk :clinic_inventory_entries, :profile_id, :clinic_inventory_profiles
    add_index :clinic_inventory_entries, [ :practice_id, :request_key ], unique: true, name: "inventory_entry_retry"
    add_index :clinic_inventory_entries, [ :batch_id, :id ]
    add_index :clinic_inventory_entries, [ :item_id, :id ]
    add_index :clinic_inventory_entries, :receipt_line_id, unique: true
    add_check_constraint :clinic_inventory_entries, "(stock_type='pharmacy' AND batch_id IS NOT NULL AND item_id IS NULL) OR (stock_type='office' AND item_id IS NOT NULL AND batch_id IS NULL)", name: "inventory_entry_target"
    add_check_constraint :clinic_inventory_entries, "quantity <> 0 AND quantity BETWEEN -1000000 AND 1000000 AND quantity = round(quantity,6) AND length(trim(reason)) BETWEEN 1 AND 200 AND length(request_key) BETWEEN 1 AND 100", name: "inventory_entry_values"
    add_check_constraint :clinic_inventory_entries, "origin IN ('posted','legacy_movement','legacy_opening_balance') AND (actor_id IS NOT NULL OR origin='legacy_opening_balance') AND (origin <> 'posted' OR profile_id IS NOT NULL)", name: "inventory_entry_provenance"
    add_check_constraint :clinic_inventory_entries, "(kind IN ('receipt','adjustment_in') AND quantity > 0) OR (kind IN ('adjustment_out','damaged','expired','return_to_supplier') AND quantity < 0) OR kind IN ('office_adjustment','count_correction','opening_balance')", name: "inventory_entry_direction"
    execute <<~SQL
      INSERT INTO clinic_inventory_entries (id,practice_id,actor_id,batch_id,stock_type,kind,reason,request_key,stock_unit,origin,quantity,occurred_at,created_at,updated_at,legacy_id)
        SELECT id,practice_id,actor_id,batch_id,'pharmacy',kind,reason,request_key,'package','legacy_movement',quantity,created_at,created_at,updated_at,id FROM clinic_pharmacy_movements;
      SELECT setval(pg_get_serial_sequence('clinic_inventory_entries','id'),COALESCE((SELECT MAX(id) FROM clinic_inventory_entries),1),(SELECT COUNT(*)>0 FROM clinic_inventory_entries));
      INSERT INTO clinic_inventory_entries (practice_id,actor_id,item_id,stock_type,kind,reason,request_key,stock_unit,origin,quantity,occurred_at,created_at,updated_at,legacy_id)
        SELECT i.practice_id,m.actor_id,m.item_id,'office','office_adjustment',m.reason,'legacy-office-'||m.id,'each','legacy_movement',m.delta,m.created_at,m.created_at,m.updated_at,m.id FROM clinic_stock_movements m JOIN clinic_items i ON i.id=m.item_id;
      INSERT INTO clinic_inventory_entries (practice_id,item_id,stock_type,kind,reason,request_key,stock_unit,origin,quantity,occurred_at,created_at,updated_at)
        SELECT i.practice_id,i.id,'office','opening_balance','Unattributed legacy opening balance; derived at migration','legacy-opening-'||i.id,'each','legacy_opening_balance',i.quantity-COALESCE(SUM(e.quantity),0),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        FROM clinic_items i LEFT JOIN clinic_inventory_entries e ON e.item_id=i.id GROUP BY i.id HAVING i.quantity<>COALESCE(SUM(e.quantity),0);
    SQL

    create_table :clinic_inventory_holds do |t|
      t.bigint :practice_id, :batch_id, null: false
      t.bigint :actor_id
      t.string :kind, :reason, :request_key, null: false
      t.timestamps
    end
    tenant_key :clinic_inventory_holds
    actor_key :clinic_inventory_holds
    scoped_fk :clinic_inventory_holds, :batch_id, :clinic_pharmacy_batches
    add_index :clinic_inventory_holds, [ :practice_id, :request_key ], unique: true, name: "inventory_hold_retry"
    add_check_constraint :clinic_inventory_holds, "kind IN ('quarantined','recalled','temperature','damaged') AND length(trim(reason)) BETWEEN 1 AND 200", name: "inventory_hold_reason"
    create_table :clinic_inventory_hold_releases do |t|
      t.bigint :practice_id, :hold_id, :actor_id, null: false
      t.string :reason, :request_key, null: false
      t.timestamps
    end
    tenant_key :clinic_inventory_hold_releases
    actor_key :clinic_inventory_hold_releases
    scoped_fk :clinic_inventory_hold_releases, :hold_id, :clinic_inventory_holds
    add_index :clinic_inventory_hold_releases, :hold_id, unique: true
    add_index :clinic_inventory_hold_releases, [ :practice_id, :request_key ], unique: true, name: "inventory_release_retry"
    add_check_constraint :clinic_inventory_hold_releases, "length(trim(reason)) BETWEEN 1 AND 200", name: "inventory_release_reason"
    execute "INSERT INTO clinic_inventory_holds (practice_id,batch_id,kind,reason,request_key,created_at,updated_at) SELECT practice_id,id,status,'Legacy batch status at migration','legacy-hold-'||id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM clinic_pharmacy_batches WHERE status <> 'active'"

    create_table :clinic_inventory_counts do |t|
      t.bigint :practice_id, :batch_id, :actor_id, :profile_id, null: false
      t.bigint :cutoff_entry_id
      t.decimal :expected_quantity, :observed_quantity, null: false
      t.string :reason, :request_key, null: false
      t.timestamps
    end
    tenant_key :clinic_inventory_counts
    actor_key :clinic_inventory_counts
    scoped_fk :clinic_inventory_counts, :batch_id, :clinic_pharmacy_batches
    scoped_fk :clinic_inventory_counts, :profile_id, :clinic_inventory_profiles
    add_index :clinic_inventory_counts, [ :practice_id, :request_key ], unique: true, name: "inventory_count_retry"
    add_check_constraint :clinic_inventory_counts, "expected_quantity BETWEEN 0 AND 1000000 AND observed_quantity BETWEEN 0 AND 1000000 AND observed_quantity = round(observed_quantity,6)", name: "inventory_count_values"
    create_table :clinic_inventory_count_approvals do |t|
      t.bigint :practice_id, :count_id, :actor_id, null: false
      t.bigint :entry_id
      t.timestamps
    end
    tenant_key :clinic_inventory_count_approvals
    actor_key :clinic_inventory_count_approvals
    scoped_fk :clinic_inventory_count_approvals, :count_id, :clinic_inventory_counts
    scoped_fk :clinic_inventory_count_approvals, :entry_id, :clinic_inventory_entries
    add_index :clinic_inventory_count_approvals, :count_id, unique: true

    create_table :clinic_inventory_catalog_events do |t|
      t.bigint :practice_id, :product_id, :actor_id, null: false
      t.string :changed_fields, array: true, null: false
      t.timestamps
    end
    tenant_key :clinic_inventory_catalog_events
    actor_key :clinic_inventory_catalog_events
    scoped_fk :clinic_inventory_catalog_events, :product_id, :clinic_pharmacy_products
    install_guards
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve stock history; restore a matched verified backup for rollback."
  end

  private

  def tenant_key(table)
    add_index table, [ :practice_id, :id ], unique: true
    add_foreign_key table, :clinic_practices, column: :practice_id
  end

  def scoped_fk(table, column, target)
    add_foreign_key table, target, column: [ :practice_id, column ], primary_key: [ :practice_id, :id ]
  end

  def actor_key(table)
    add_foreign_key table, :clinic_memberships, column: [ :practice_id, :actor_id ], primary_key: [ :practice_id, :user_id ]
  end

  def install_guards
    execute <<~SQL
      CREATE FUNCTION inventory_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Inventory history is append-only'; END $$;
      CREATE FUNCTION inventory_entry_post() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE unit text; scale integer; line clinic_inventory_receipt_lines%ROWTYPE;
      BEGIN
        IF NEW.origin <> 'posted' THEN RAISE EXCEPTION 'Legacy provenance is migration-only'; END IF;
        IF NEW.stock_type='pharmacy' THEN
          SELECT p.stock_unit,p.quantity_scale INTO unit,scale FROM clinic_pharmacy_batches b JOIN clinic_pharmacy_products p ON p.id=b.product_id WHERE b.id=NEW.batch_id AND b.practice_id=NEW.practice_id;
          IF FOUND AND (NEW.stock_unit<>unit OR NEW.quantity<>round(NEW.quantity,scale)) THEN RAISE EXCEPTION 'Incompatible stock unit or precision'; END IF;
          IF NEW.kind='receipt' THEN
            SELECT * INTO line FROM clinic_inventory_receipt_lines WHERE id=NEW.receipt_line_id AND practice_id=NEW.practice_id;
            IF NOT FOUND OR line.batch_id<>NEW.batch_id OR line.quantity<>NEW.quantity OR line.stock_unit<>NEW.stock_unit THEN RAISE EXCEPTION 'Receipt movement requires a matching receipt line'; END IF;
          ELSIF NEW.receipt_line_id IS NOT NULL THEN RAISE EXCEPTION 'Only receipts reference receipt lines'; END IF;
          UPDATE clinic_pharmacy_batches SET on_hand=on_hand+NEW.quantity WHERE id=NEW.batch_id AND practice_id=NEW.practice_id;
        ELSE
          IF NEW.stock_unit<>'each' OR NEW.quantity<>round(NEW.quantity,0) THEN RAISE EXCEPTION 'Office stock uses whole each units'; END IF;
          UPDATE clinic_items SET quantity=quantity+NEW.quantity WHERE id=NEW.item_id AND practice_id=NEW.practice_id;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER inventory_post BEFORE INSERT ON clinic_inventory_entries FOR EACH ROW EXECUTE FUNCTION inventory_entry_post();
      CREATE FUNCTION inventory_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME='clinic_pharmacy_batches' THEN
          IF (NEW.practice_id,NEW.product_id,NEW.lot_id,NEW.location_id,NEW.lot_number,NEW.location,NEW.expires_on,NEW.supplier,NEW.status) IS DISTINCT FROM (OLD.practice_id,OLD.product_id,OLD.lot_id,OLD.location_id,OLD.lot_number,OLD.location,OLD.expires_on,OLD.supplier,OLD.status) THEN RAISE EXCEPTION 'Stock identity and legacy status are immutable'; END IF;
          IF NEW.on_hand<>OLD.on_hand AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Post a stock movement to change balance'; END IF;
        ELSE
          IF NEW.practice_id<>OLD.practice_id THEN RAISE EXCEPTION 'Stock clinic is immutable'; END IF;
          IF NEW.quantity<>OLD.quantity AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Post a stock movement to change balance'; END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER inventory_batch_balance BEFORE UPDATE ON clinic_pharmacy_batches FOR EACH ROW EXECUTE FUNCTION inventory_balance_guard();
      CREATE TRIGGER inventory_office_balance BEFORE UPDATE ON clinic_items FOR EACH ROW EXECUTE FUNCTION inventory_balance_guard();
      CREATE FUNCTION inventory_catalog_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE actor bigint; fields varchar[];
      BEGIN
        IF (NEW.practice_id,NEW.stock_unit,NEW.quantity_scale,NEW.package_size,NEW.unit_reference) IS DISTINCT FROM (OLD.practice_id,OLD.stock_unit,OLD.quantity_scale,OLD.package_size,OLD.unit_reference) THEN RAISE EXCEPTION 'Create a verified package variant instead of changing historical units'; END IF;
        SELECT array_agg(n.key ORDER BY n.key) INTO fields FROM jsonb_each(to_jsonb(NEW)) n WHERE n.key<>'updated_at' AND n.value IS DISTINCT FROM to_jsonb(OLD)->n.key;
        IF fields IS NOT NULL THEN
          actor := NULLIF(current_setting('apply.inventory_actor',true),'')::bigint;
          IF actor IS NULL THEN RAISE EXCEPTION 'Catalog changes require actor attribution'; END IF;
          INSERT INTO clinic_inventory_catalog_events (practice_id,product_id,actor_id,changed_fields,created_at,updated_at) VALUES (NEW.practice_id,NEW.id,actor,fields,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER inventory_catalog_change BEFORE UPDATE ON clinic_pharmacy_products FOR EACH ROW EXECUTE FUNCTION inventory_catalog_guard();
    SQL
    %w[clinic_inventory_profiles clinic_inventory_lots clinic_inventory_receipts clinic_inventory_receipt_lines clinic_inventory_entries clinic_inventory_holds clinic_inventory_hold_releases clinic_inventory_counts clinic_inventory_count_approvals clinic_inventory_catalog_events clinic_notes].each do |table|
      execute "CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION inventory_immutable()"
    end
    # Old tables are preserved as immutable migration evidence, not writable ledgers.
    execute "DROP TRIGGER pharmacy_guard ON clinic_pharmacy_movements"
    %w[clinic_pharmacy_movements clinic_stock_movements].each do |table|
      execute "CREATE TRIGGER legacy_inventory_frozen BEFORE INSERT OR UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION inventory_immutable()"
    end
  end
end
