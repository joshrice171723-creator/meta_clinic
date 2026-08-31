class HardenInventoryPosting < ActiveRecord::Migration[8.1]
  def up
    add_check_constraint :clinic_pharmacy_products, "package_size = 1 OR (unit_reference IS NOT NULL AND length(trim(unit_reference)) > 0)", name: "inventory_unit_evidence"
    add_check_constraint :clinic_inventory_receipt_lines, "unit_cost IS NULL OR currency IS NOT NULL", name: "inventory_cost_currency"
    add_check_constraint :clinic_items, "quantity BETWEEN 0 AND 1000000", name: "inventory_office_range"
    add_column :clinic_inventory_entries, :count_id, :bigint
    add_foreign_key :clinic_inventory_entries, :clinic_inventory_counts, column: [ :practice_id, :count_id ], primary_key: [ :practice_id, :id ]
    add_index :clinic_inventory_entries, :count_id, unique: true
    add_check_constraint :clinic_inventory_entries, "(kind = 'count_correction') = (count_id IS NOT NULL)", name: "inventory_count_entry"
    add_index :clinic_pharmacy_batches, [ :practice_id, :lot_id, :location_id ], unique: true, name: "inventory_position_identity"
    %w[holds hold_releases catalog_events count_approvals].each do |kind|
      table = "clinic_inventory_#{kind}"
      add_column table, :profile_id, :bigint
      add_foreign_key table, :clinic_inventory_profiles, column: [ :practice_id, :profile_id ], primary_key: [ :practice_id, :id ]
    end
    execute <<~SQL
      CREATE FUNCTION inventory_authorize(clinic bigint, actor bigint, action text, profile bigint DEFAULT NULL) RETURNS bigint LANGUAGE plpgsql AS $$
      DECLARE member clinic_memberships%ROWTYPE; configuration clinic_inventory_profiles%ROWTYPE; enabled boolean;
      BEGIN
        PERFORM 1 FROM clinic_practices WHERE id=clinic FOR SHARE;
        SELECT active INTO enabled FROM users WHERE id=actor FOR SHARE;
        SELECT * INTO member FROM clinic_memberships WHERE practice_id=clinic AND user_id=actor FOR SHARE;
        IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE='Actor has no clinic membership'; END IF;
        IF NOT COALESCE(enabled AND member.active AND member.inventory_access AND (to_jsonb(member)->>('inventory_'||action))::boolean,false) THEN
          RAISE EXCEPTION 'Inventory action not permitted';
        END IF;
        SELECT * INTO configuration FROM clinic_inventory_profiles WHERE practice_id=clinic ORDER BY version DESC LIMIT 1;
        IF action<>'configure' AND (configuration.id IS NULL OR configuration.status<>'synthetic' OR NOT ('inventory'=ANY(configuration.capabilities)) OR (profile IS NOT NULL AND profile<>configuration.id)) THEN
          RAISE EXCEPTION 'Inventory profile is unavailable or stale';
        END IF;
        RETURN configuration.id;
      END $$;
      CREATE FUNCTION inventory_new_position() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME='clinic_items' THEN
          IF NEW.quantity<>0 THEN RAISE EXCEPTION 'New stock starts at zero; post opening stock'; END IF;
        ELSE
          IF NOT EXISTS (SELECT 1 FROM clinic_inventory_lots l JOIN clinic_inventory_locations s ON s.id=NEW.location_id AND s.practice_id=NEW.practice_id WHERE l.id=NEW.lot_id AND l.practice_id=NEW.practice_id AND l.product_id=NEW.product_id AND l.number=NEW.lot_number AND l.expires_on=NEW.expires_on AND s.name=NEW.location) THEN
            RAISE foreign_key_violation USING MESSAGE='Stock position must match its clinic, lot and location';
          END IF;
          IF NEW.on_hand<>0 OR NEW.status<>'active' THEN RAISE EXCEPTION 'New positions start empty without holds'; END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER inventory_new_batch BEFORE INSERT ON clinic_pharmacy_batches FOR EACH ROW EXECUTE FUNCTION inventory_new_position();
      CREATE TRIGGER inventory_new_office BEFORE INSERT ON clinic_items FOR EACH ROW EXECUTE FUNCTION inventory_new_position();
      CREATE FUNCTION inventory_posting_context() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE receipt clinic_inventory_receipts%ROWTYPE; observation clinic_inventory_counts%ROWTYPE; balance numeric; cutoff bigint; active_product boolean;
      BEGIN
        PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,CASE WHEN NEW.kind='receipt' THEN 'receive' ELSE 'adjust' END,NEW.profile_id);
        IF NEW.stock_type='office' AND NEW.kind<>'office_adjustment' OR NEW.stock_type='pharmacy' AND NEW.kind NOT IN ('receipt','adjustment_in','adjustment_out','damaged','expired','return_to_supplier','count_correction') THEN RAISE EXCEPTION 'Unsupported stock action'; END IF;
        IF NEW.stock_type='pharmacy' THEN
          SELECT p.active INTO active_product FROM clinic_pharmacy_products p JOIN clinic_pharmacy_batches b ON b.product_id=p.id WHERE b.id=NEW.batch_id FOR SHARE OF p;
          IF NEW.quantity>0 AND NOT active_product THEN RAISE EXCEPTION 'Inactive product cannot receive stock'; END IF;
        END IF;
        IF NEW.kind='receipt' THEN
          SELECT r.* INTO receipt FROM clinic_inventory_receipts r JOIN clinic_inventory_receipt_lines l ON l.receipt_id=r.id WHERE l.id=NEW.receipt_line_id;
          IF receipt.id IS NULL OR (receipt.practice_id,receipt.actor_id,receipt.profile_id,receipt.received_at) IS DISTINCT FROM (NEW.practice_id,NEW.actor_id,NEW.profile_id,NEW.occurred_at) THEN RAISE EXCEPTION 'Receipt attribution does not match'; END IF;
        END IF;
        IF NEW.kind='count_correction' THEN
          SELECT * INTO observation FROM clinic_inventory_counts WHERE id=NEW.count_id AND practice_id=NEW.practice_id;
          SELECT on_hand INTO balance FROM clinic_pharmacy_batches WHERE id=NEW.batch_id FOR UPDATE;
          SELECT MAX(id) INTO cutoff FROM clinic_inventory_entries WHERE batch_id=NEW.batch_id;
          IF observation.id IS NULL OR observation.batch_id<>NEW.batch_id OR observation.expected_quantity<>balance OR observation.cutoff_entry_id IS DISTINCT FROM cutoff OR NEW.quantity<>observation.observed_quantity-observation.expected_quantity THEN RAISE EXCEPTION 'Count is stale or variance does not match'; END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER inventory_context BEFORE INSERT ON clinic_inventory_entries FOR EACH ROW EXECUTE FUNCTION inventory_posting_context();
      CREATE FUNCTION inventory_receipt_check() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE product clinic_pharmacy_products%ROWTYPE;
      BEGIN
        SELECT p.* INTO product FROM clinic_pharmacy_products p JOIN clinic_pharmacy_batches b ON b.product_id=p.id WHERE b.id=NEW.batch_id;
        IF NEW.stock_unit<>product.stock_unit OR NEW.quantity<>round(NEW.quantity,product.quantity_scale) OR NOT ((NEW.input_unit='package' AND NEW.conversion_factor=product.package_size AND NEW.input_quantity=round(NEW.input_quantity,0)) OR (NEW.input_unit=product.stock_unit AND NEW.conversion_factor=1 AND NEW.input_quantity=round(NEW.input_quantity,product.quantity_scale))) THEN RAISE EXCEPTION 'Receipt conversion does not match verified product units'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER inventory_receipt_units BEFORE INSERT ON clinic_inventory_receipt_lines FOR EACH ROW EXECUTE FUNCTION inventory_receipt_check();
      CREATE FUNCTION inventory_evidence_complete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME='clinic_inventory_receipts' THEN
          IF NOT EXISTS (SELECT 1 FROM clinic_inventory_receipt_lines WHERE receipt_id=NEW.id) THEN RAISE EXCEPTION 'Receipt has no lines'; END IF;
        ELSIF TG_TABLE_NAME='clinic_inventory_receipt_lines' THEN
          IF NOT EXISTS (SELECT 1 FROM clinic_inventory_entries WHERE receipt_line_id=NEW.id AND kind='receipt') THEN RAISE EXCEPTION 'Receipt line has no posting'; END IF;
        ELSE
          IF NEW.count_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clinic_inventory_count_approvals WHERE count_id=NEW.count_id AND entry_id=NEW.id AND actor_id=NEW.actor_id) THEN RAISE EXCEPTION 'Count posting has no matching approval'; END IF;
        END IF;
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER inventory_receipt_complete AFTER INSERT ON clinic_inventory_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_evidence_complete();
      CREATE CONSTRAINT TRIGGER inventory_line_complete AFTER INSERT ON clinic_inventory_receipt_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_evidence_complete();
      CREATE CONSTRAINT TRIGGER inventory_count_complete AFTER INSERT ON clinic_inventory_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_evidence_complete();
      CREATE FUNCTION inventory_evidence_context() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE action text; stock numeric; cutoff bigint; scale integer; observation clinic_inventory_counts%ROWTYPE; previous integer;
      BEGIN
        action := CASE TG_TABLE_NAME WHEN 'clinic_inventory_receipts' THEN 'receive' WHEN 'clinic_inventory_holds' THEN 'hold' WHEN 'clinic_inventory_hold_releases' THEN 'release' WHEN 'clinic_inventory_counts' THEN 'count' WHEN 'clinic_inventory_count_approvals' THEN 'adjust' WHEN 'clinic_inventory_profiles' THEN 'configure' ELSE 'catalog' END;
        IF TG_TABLE_NAME='clinic_inventory_profiles' THEN
          PERFORM 1 FROM clinic_practices WHERE id=NEW.practice_id FOR UPDATE;
          SELECT COALESCE(MAX(version),0) INTO previous FROM clinic_inventory_profiles WHERE practice_id=NEW.practice_id;
          IF NEW.version<>previous+1 THEN RAISE EXCEPTION 'Profile version must follow current version'; END IF;
          IF previous=0 AND NEW.actor_id IS NULL AND NEW.status='synthetic' THEN RETURN NEW; END IF;
          PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,action);
        ELSE
          NEW.profile_id := inventory_authorize(NEW.practice_id,NEW.actor_id,action,NEW.profile_id);
        END IF;
        IF TG_TABLE_NAME='clinic_inventory_counts' THEN
          SELECT b.on_hand,p.quantity_scale INTO stock,scale FROM clinic_pharmacy_batches b JOIN clinic_pharmacy_products p ON p.id=b.product_id WHERE b.id=NEW.batch_id FOR UPDATE OF b;
          SELECT MAX(id) INTO cutoff FROM clinic_inventory_entries WHERE batch_id=NEW.batch_id;
          IF NEW.expected_quantity<>stock OR NEW.cutoff_entry_id IS DISTINCT FROM cutoff OR NEW.observed_quantity<>round(NEW.observed_quantity,scale) THEN RAISE EXCEPTION 'Count snapshot does not match stock'; END IF;
        ELSIF TG_TABLE_NAME='clinic_inventory_count_approvals' THEN
          SELECT * INTO observation FROM clinic_inventory_counts WHERE id=NEW.count_id;
          SELECT on_hand INTO stock FROM clinic_pharmacy_batches WHERE id=observation.batch_id FOR UPDATE;
          SELECT MAX(id) INTO cutoff FROM clinic_inventory_entries WHERE batch_id=observation.batch_id;
          IF NEW.entry_id IS NULL THEN
            IF observation.expected_quantity<>observation.observed_quantity OR stock<>observation.observed_quantity OR cutoff IS DISTINCT FROM observation.cutoff_entry_id THEN RAISE EXCEPTION 'Count approval needs an exact variance posting'; END IF;
          ELSIF NOT EXISTS (SELECT 1 FROM clinic_inventory_entries WHERE id=NEW.entry_id AND count_id=NEW.count_id AND actor_id=NEW.actor_id AND profile_id=NEW.profile_id) THEN RAISE EXCEPTION 'Count approval posting does not match'; END IF;
        END IF;
        RETURN NEW;
      END $$;
    SQL
    %w[profiles receipts holds hold_releases counts count_approvals catalog_events].each do |kind|
      execute "CREATE TRIGGER inventory_evidence_authority BEFORE INSERT ON clinic_inventory_#{kind} FOR EACH ROW EXECUTE FUNCTION inventory_evidence_context()"
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Restore a verified matched backup; do not discard inventory evidence."
  end
end
