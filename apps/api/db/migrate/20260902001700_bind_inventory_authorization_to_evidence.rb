class BindInventoryAuthorizationToEvidence < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE OR REPLACE FUNCTION inventory_evidence_context() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE action text; stock numeric; cutoff bigint; scale integer; observation clinic_inventory_counts%ROWTYPE; previous integer;
      BEGIN
        action := CASE TG_TABLE_NAME WHEN 'clinic_inventory_count_approvals' THEN 'count' WHEN 'clinic_inventory_receipts' THEN 'receive' WHEN 'clinic_inventory_hold_releases' THEN 'release' WHEN 'clinic_inventory_counts' THEN 'count' WHEN 'clinic_inventory_profiles' THEN 'configure' ELSE 'catalog' END;
        IF TG_TABLE_NAME='clinic_inventory_holds' THEN
          action := CASE WHEN NEW.recall_id IS NOT NULL THEN 'recall.lock' WHEN NEW.transfer_id IS NOT NULL THEN 'transfer' ELSE 'hold' END;
        END IF;
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
      END; $$;
      CREATE OR REPLACE FUNCTION inventory_posting_context() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE receipt clinic_inventory_receipts%ROWTYPE; observation clinic_inventory_counts%ROWTYPE; balance numeric; cutoff bigint; active_product boolean;
      BEGIN
        PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,CASE WHEN NEW.kind='receipt' THEN 'receive' WHEN NEW.transfer_id IS NOT NULL THEN 'transfer' WHEN NEW.recall_disposition_id IS NOT NULL THEN 'recall.dispose' WHEN NEW.count_id IS NOT NULL THEN 'count' ELSE 'adjust' END,NEW.profile_id);
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
      END; $$;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Restore inventory trigger authorization from verified history."
  end
end
