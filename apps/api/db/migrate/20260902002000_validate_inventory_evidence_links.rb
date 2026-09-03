class ValidateInventoryEvidenceLinks < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE OR REPLACE FUNCTION inventory_evidence_link_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE transfer clinic_inventory_transfers%ROWTYPE; disposition clinic_inventory_recall_dispositions%ROWTYPE; recall clinic_inventory_recalls%ROWTYPE;
      BEGIN
        IF TG_TABLE_NAME = 'clinic_inventory_entries' THEN
          IF num_nonnulls(NEW.transfer_id, NEW.recall_disposition_id, NEW.count_id) > 1 THEN
            RAISE EXCEPTION 'Inventory evidence links are mutually exclusive';
          END IF;
          IF NEW.transfer_id IS NOT NULL THEN
            SELECT t.* INTO transfer
              FROM clinic_inventory_transfers t
              JOIN clinic_pharmacy_batches source ON source.id = t.source_batch_id AND source.practice_id = t.practice_id
              JOIN clinic_pharmacy_batches destination ON destination.id = t.destination_batch_id AND destination.practice_id = t.practice_id
             WHERE t.id = NEW.transfer_id;
            IF NOT FOUND OR NEW.practice_id <> transfer.practice_id OR NEW.actor_id IS DISTINCT FROM transfer.actor_id OR NEW.stock_type <> 'pharmacy' OR NOT (
              (NEW.kind = 'adjustment_out' AND NEW.batch_id = transfer.source_batch_id AND NEW.quantity = -transfer.quantity) OR
              (NEW.kind = 'adjustment_in' AND NEW.batch_id = transfer.destination_batch_id AND NEW.quantity = transfer.quantity)
            ) THEN
              RAISE EXCEPTION 'Transfer evidence does not match the inventory entry';
            END IF;
          ELSIF NEW.recall_disposition_id IS NOT NULL THEN
            SELECT d.* INTO disposition
              FROM clinic_inventory_recall_dispositions d
              JOIN clinic_inventory_recalls r ON r.id = d.recall_id AND r.practice_id = d.practice_id
             WHERE d.id = NEW.recall_disposition_id;
            IF NOT FOUND OR NEW.practice_id <> disposition.practice_id OR NEW.actor_id IS DISTINCT FROM disposition.actor_id OR NEW.stock_type <> 'pharmacy' OR NEW.kind <> 'damaged' OR NEW.batch_id <> disposition.batch_id OR NEW.quantity <> -disposition.quantity OR NOT EXISTS (
              SELECT 1 FROM clinic_inventory_recall_lots rl
              JOIN clinic_inventory_lots lot ON lot.id = rl.lot_id AND lot.practice_id = rl.practice_id
              JOIN clinic_pharmacy_batches batch ON batch.lot_id = lot.id AND batch.practice_id = lot.practice_id
              WHERE rl.practice_id = disposition.practice_id AND rl.recall_id = disposition.recall_id AND batch.id = disposition.batch_id
            ) THEN
              RAISE EXCEPTION 'Recall disposition evidence does not match the inventory entry';
            END IF;
          ELSIF NEW.count_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM clinic_inventory_counts c
             WHERE c.id = NEW.count_id AND c.practice_id = NEW.practice_id AND c.batch_id = NEW.batch_id AND NEW.kind = 'count_correction'
          ) THEN
            RAISE EXCEPTION 'Count evidence does not match the inventory entry';
          END IF;
        ELSE
          IF num_nonnulls(NEW.transfer_id, NEW.recall_id) > 1 THEN
            RAISE EXCEPTION 'Hold evidence links are mutually exclusive';
          END IF;
          IF NEW.transfer_id IS NOT NULL THEN
            SELECT t.* INTO transfer
              FROM clinic_inventory_transfers t
              JOIN clinic_pharmacy_batches destination ON destination.id = t.destination_batch_id AND destination.practice_id = t.practice_id
             WHERE t.id = NEW.transfer_id;
            IF NOT FOUND OR NEW.practice_id <> transfer.practice_id OR NEW.actor_id IS DISTINCT FROM transfer.actor_id OR NEW.batch_id <> transfer.destination_batch_id OR NEW.kind <> 'quarantined' THEN
              RAISE EXCEPTION 'Transfer evidence does not match the inventory hold';
            END IF;
          ELSIF NEW.recall_id IS NOT NULL THEN
            SELECT r.* INTO recall
              FROM clinic_inventory_recalls r
             WHERE r.id = NEW.recall_id;
            IF NOT FOUND OR NEW.practice_id <> recall.practice_id OR NEW.actor_id IS DISTINCT FROM recall.actor_id OR NEW.kind <> 'recalled' OR NOT EXISTS (
              SELECT 1 FROM clinic_inventory_recall_lots rl
              JOIN clinic_inventory_lots lot ON lot.id = rl.lot_id AND lot.practice_id = rl.practice_id
              JOIN clinic_pharmacy_batches batch ON batch.lot_id = lot.id AND batch.practice_id = lot.practice_id
              WHERE rl.practice_id = recall.practice_id AND rl.recall_id = recall.id AND batch.id = NEW.batch_id
            ) THEN
              RAISE EXCEPTION 'Recall evidence does not match the inventory hold';
            END IF;
          END IF;
        END IF;
        RETURN NEW;
      END; $$;
      DROP TRIGGER IF EXISTS inventory_evidence_link_guard ON clinic_inventory_entries;
      CREATE TRIGGER inventory_evidence_link_guard BEFORE INSERT OR UPDATE ON clinic_inventory_entries FOR EACH ROW EXECUTE FUNCTION inventory_evidence_link_guard();
      DROP TRIGGER IF EXISTS inventory_evidence_link_guard ON clinic_inventory_holds;
      CREATE TRIGGER inventory_evidence_link_guard BEFORE INSERT OR UPDATE ON clinic_inventory_holds FOR EACH ROW EXECUTE FUNCTION inventory_evidence_link_guard();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Restore inventory evidence validation from verified history."
  end
end
