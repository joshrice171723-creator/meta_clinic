class AddRecallCaseClosures < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_inventory_recall_closures do |t|
      t.bigint :practice_id, :recall_id, :actor_id, :profile_id, null: false
      t.string :reason, :evidence_reference, :request_key, :payload_digest, null: false
      t.timestamps
    end
    add_index :clinic_inventory_recall_closures, %i[practice_id id], unique: true,
      name: "inventory_recall_closures_practice_id"
    add_index :clinic_inventory_recall_closures, %i[practice_id recall_id], unique: true,
      name: "inventory_recall_closure_once"
    add_index :clinic_inventory_recall_closures, %i[practice_id request_key], unique: true,
      name: "inventory_recall_closure_retry"
    add_foreign_key :clinic_inventory_recall_closures, :clinic_practices,
      column: :practice_id, name: "fk_inventory_recall_closures_practice"
    add_foreign_key :clinic_inventory_recall_closures, :clinic_inventory_recalls,
      column: %i[practice_id recall_id], primary_key: %i[practice_id id],
      name: "fk_inventory_recall_closures_recall"
    add_foreign_key :clinic_inventory_recall_closures, :clinic_memberships,
      column: %i[practice_id actor_id], primary_key: %i[practice_id user_id],
      name: "fk_inventory_recall_closures_actor"
    add_foreign_key :clinic_inventory_recall_closures, :clinic_inventory_profiles,
      column: %i[practice_id profile_id], primary_key: %i[practice_id id],
      name: "fk_inventory_recall_closures_profile"
    add_check_constraint :clinic_inventory_recall_closures,
      "length(trim(reason)) BETWEEN 1 AND 200 " \
        "AND length(trim(evidence_reference)) BETWEEN 1 AND 200 " \
        "AND request_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' " \
        "AND payload_digest ~ '^[0-9a-f]{64}$'",
      name: "inventory_recall_closure_values"

    remove_index :clinic_inventory_holds, name: "inventory_hold_recall_batch_once"
    add_index :clinic_inventory_holds, %i[recall_id batch_id id],
      where: "recall_id IS NOT NULL", name: "inventory_hold_recall_batch_history"

    execute <<~SQL
      CREATE FUNCTION inventory_recall_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.status = 'closed' THEN RAISE EXCEPTION 'A new recall cannot start closed'; END IF;
        ELSE
          IF (
            NEW.practice_id, NEW.product_id, NEW.actor_id, NEW.reference, NEW.reason,
            NEW.required_disposition, NEW.effective_on, NEW.affected_units,
            NEW.request_key, NEW.payload_digest
          ) IS DISTINCT FROM (
            OLD.practice_id, OLD.product_id, OLD.actor_id, OLD.reference, OLD.reason,
            OLD.required_disposition, OLD.effective_on, OLD.affected_units,
            OLD.request_key, OLD.payload_digest
          ) THEN
            RAISE EXCEPTION 'Recall case identity and evidence are immutable';
          END IF;
          IF OLD.status <> 'closed' AND NEW.status = 'closed' AND NOT EXISTS (
            SELECT 1 FROM clinic_inventory_recall_closures closure
             WHERE closure.practice_id = NEW.practice_id AND closure.recall_id = NEW.id
          ) THEN
            RAISE EXCEPTION 'A recall requires closure evidence before it can close';
          END IF;
          IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
            RAISE EXCEPTION 'A closed recall cannot be reopened';
          END IF;
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER inventory_recall_status_guard
      BEFORE INSERT OR UPDATE ON clinic_inventory_recalls
      FOR EACH ROW EXECUTE FUNCTION inventory_recall_status_guard();

      CREATE FUNCTION inventory_recall_lot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE case_product_id bigint;
      BEGIN
        SELECT product_id INTO case_product_id FROM clinic_inventory_recalls
         WHERE practice_id = NEW.practice_id AND id = NEW.recall_id;
        IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE = 'Recall lot must belong to the clinic case'; END IF;
        PERFORM 1 FROM clinic_pharmacy_products
         WHERE practice_id = NEW.practice_id AND id = case_product_id FOR UPDATE;
        IF NOT EXISTS (
          SELECT 1
            FROM clinic_inventory_recalls recall
            JOIN clinic_inventory_lots lot ON lot.practice_id = recall.practice_id
           WHERE recall.practice_id = NEW.practice_id
             AND recall.id = NEW.recall_id
             AND recall.status <> 'closed'
             AND lot.id = NEW.lot_id
             AND lot.product_id = recall.product_id
             AND NOT EXISTS (
               SELECT 1 FROM clinic_inventory_recall_closures closure
                WHERE closure.practice_id = recall.practice_id AND closure.recall_id = recall.id
             )
        ) THEN
          RAISE EXCEPTION 'Recall lots must belong to the open recall product';
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER inventory_recall_lot_guard
      BEFORE INSERT ON clinic_inventory_recall_lots
      FOR EACH ROW EXECUTE FUNCTION inventory_recall_lot_guard();

      CREATE FUNCTION inventory_recall_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.recall_id IS NULL THEN RETURN NEW; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('inventory-recall-hold:' || NEW.recall_id::text || ':' || NEW.batch_id::text, 0));
        IF NOT EXISTS (
          SELECT 1
            FROM clinic_inventory_recalls recall
            JOIN clinic_inventory_recall_lots link ON link.practice_id = recall.practice_id AND link.recall_id = recall.id
            JOIN clinic_pharmacy_batches batch ON batch.practice_id = link.practice_id AND batch.lot_id = link.lot_id
           WHERE recall.practice_id = NEW.practice_id
             AND recall.id = NEW.recall_id
             AND recall.status <> 'closed'
             AND batch.id = NEW.batch_id
             AND NOT EXISTS (
               SELECT 1 FROM clinic_inventory_recall_closures closure
                WHERE closure.practice_id = recall.practice_id AND closure.recall_id = recall.id
             )
        ) THEN
          RAISE EXCEPTION 'Recall holds require an open matching recall lot';
        END IF;
        IF EXISTS (
          SELECT 1 FROM clinic_inventory_holds existing
           WHERE existing.recall_id = NEW.recall_id AND existing.batch_id = NEW.batch_id
             AND NOT EXISTS (
               SELECT 1 FROM clinic_inventory_hold_releases release WHERE release.hold_id = existing.id
             )
        ) THEN
          RAISE EXCEPTION 'This recall already has an active hold on the stock position';
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER inventory_recall_hold_guard
      BEFORE INSERT ON clinic_inventory_holds
      FOR EACH ROW EXECUTE FUNCTION inventory_recall_hold_guard();

      CREATE FUNCTION inventory_recall_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM clinic_inventory_holds hold
           WHERE hold.practice_id = NEW.practice_id AND hold.id = NEW.hold_id AND hold.recall_id IS NOT NULL
        ) THEN
          RAISE EXCEPTION 'Recall holds cannot be released directly';
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER inventory_recall_release_guard
      BEFORE INSERT ON clinic_inventory_hold_releases
      FOR EACH ROW EXECUTE FUNCTION inventory_recall_release_guard();

      CREATE FUNCTION inventory_recall_closure_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE case_record clinic_inventory_recalls%ROWTYPE;
      BEGIN
        NEW.profile_id := inventory_authorize(NEW.practice_id, NEW.actor_id, 'recall.dispose', NEW.profile_id);
        SELECT * INTO case_record FROM clinic_inventory_recalls
         WHERE practice_id = NEW.practice_id AND id = NEW.recall_id;
        IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE = 'Recall closure must belong to the clinic case'; END IF;
        PERFORM 1 FROM clinic_pharmacy_products
         WHERE practice_id = NEW.practice_id AND id = case_record.product_id FOR UPDATE;
        SELECT * INTO case_record FROM clinic_inventory_recalls
         WHERE practice_id = NEW.practice_id AND id = NEW.recall_id FOR UPDATE;
        IF case_record.status = 'closed' OR EXISTS (
          SELECT 1 FROM clinic_inventory_recall_closures
           WHERE practice_id = NEW.practice_id AND recall_id = NEW.recall_id
        ) THEN
          RAISE EXCEPTION 'Recall case is already closed';
        END IF;
        IF EXISTS (
          SELECT 1
            FROM clinic_inventory_recall_lots link
            JOIN clinic_pharmacy_batches batch ON batch.practice_id = link.practice_id AND batch.lot_id = link.lot_id
           WHERE link.practice_id = NEW.practice_id AND link.recall_id = NEW.recall_id AND batch.on_hand > 0
        ) THEN
          RAISE EXCEPTION 'Every recalled stock position must reach zero before closure';
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER inventory_recall_closure_guard
      BEFORE INSERT ON clinic_inventory_recall_closures
      FOR EACH ROW EXECUTE FUNCTION inventory_recall_closure_guard();

      CREATE TRIGGER inventory_recall_closure_immutable
      BEFORE UPDATE OR DELETE ON clinic_inventory_recall_closures
      FOR EACH ROW EXECUTE FUNCTION inventory_immutable();

      CREATE FUNCTION inventory_recall_containment_complete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_TABLE_NAME = 'clinic_pharmacy_batches' THEN
          IF EXISTS (
            SELECT 1
              FROM clinic_pharmacy_batches batch
              JOIN clinic_inventory_recall_lots link ON link.practice_id = batch.practice_id AND link.lot_id = batch.lot_id
              JOIN clinic_inventory_recalls recall ON recall.practice_id = link.practice_id AND recall.id = link.recall_id
             WHERE batch.practice_id = NEW.practice_id AND batch.id = NEW.id AND batch.on_hand > 0
               AND recall.status <> 'closed'
               AND NOT EXISTS (
                 SELECT 1 FROM clinic_inventory_recall_closures closure
                  WHERE closure.practice_id = recall.practice_id AND closure.recall_id = recall.id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM clinic_inventory_holds hold
                  WHERE hold.practice_id = batch.practice_id AND hold.batch_id = batch.id
                    AND hold.recall_id = recall.id AND hold.kind = 'recalled'
                    AND NOT EXISTS (
                      SELECT 1 FROM clinic_inventory_hold_releases release WHERE release.hold_id = hold.id
                    )
               )
          ) THEN
            RAISE EXCEPTION 'Positive recalled inventory requires an active case-specific hold';
          END IF;
        ELSE
          IF EXISTS (
            SELECT 1
              FROM clinic_inventory_recall_lots link
              JOIN clinic_inventory_recalls recall ON recall.practice_id = link.practice_id AND recall.id = link.recall_id
              JOIN clinic_pharmacy_batches batch ON batch.practice_id = link.practice_id AND batch.lot_id = link.lot_id
             WHERE link.practice_id = NEW.practice_id AND link.id = NEW.id AND batch.on_hand > 0
               AND recall.status <> 'closed'
               AND NOT EXISTS (
                 SELECT 1 FROM clinic_inventory_recall_closures closure
                  WHERE closure.practice_id = recall.practice_id AND closure.recall_id = recall.id
               )
               AND NOT EXISTS (
                 SELECT 1 FROM clinic_inventory_holds hold
                  WHERE hold.practice_id = batch.practice_id AND hold.batch_id = batch.id
                    AND hold.recall_id = recall.id AND hold.kind = 'recalled'
                    AND NOT EXISTS (
                      SELECT 1 FROM clinic_inventory_hold_releases release WHERE release.hold_id = hold.id
                    )
               )
          ) THEN
            RAISE EXCEPTION 'Every positive recall position requires an active case-specific hold';
          END IF;
        END IF;
        RETURN NULL;
      END $$;

      CREATE CONSTRAINT TRIGGER inventory_recall_batch_contained
      AFTER INSERT OR UPDATE ON clinic_pharmacy_batches
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION inventory_recall_containment_complete();

      CREATE CONSTRAINT TRIGGER inventory_recall_lot_contained
      AFTER INSERT ON clinic_inventory_recall_lots
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION inventory_recall_containment_complete();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Preserve recall containment and closure evidence; restore a reviewed backup instead."
  end
end
