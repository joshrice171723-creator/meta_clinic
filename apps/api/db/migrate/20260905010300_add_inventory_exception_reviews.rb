class AddInventoryExceptionReviews < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_inventory_exception_reviews do |t|
      t.bigint :practice_id, :source_id, :actor_id, :profile_id, null: false
      t.bigint :assignee_id
      t.string :source_kind, :category, :state, :reason, :request_key, :payload_digest, null: false
      t.string :evidence_reference
      t.timestamps
    end

    add_index :clinic_inventory_exception_reviews, %i[practice_id id], unique: true,
      name: "inventory_exception_reviews_practice_id"
    add_index :clinic_inventory_exception_reviews, %i[practice_id request_key], unique: true,
      name: "inventory_exception_review_retry"
    add_index :clinic_inventory_exception_reviews, %i[practice_id source_kind source_id category id],
      order: { id: :desc }, name: "inventory_exception_review_latest"

    add_foreign_key :clinic_inventory_exception_reviews, :clinic_practices,
      column: :practice_id, name: "fk_inventory_exception_reviews_practice"
    add_foreign_key :clinic_inventory_exception_reviews, :clinic_memberships,
      column: %i[practice_id actor_id], primary_key: %i[practice_id user_id],
      name: "fk_inventory_exception_reviews_actor"
    add_foreign_key :clinic_inventory_exception_reviews, :clinic_memberships,
      column: %i[practice_id assignee_id], primary_key: %i[practice_id user_id],
      name: "fk_inventory_exception_reviews_assignee"
    add_foreign_key :clinic_inventory_exception_reviews, :clinic_inventory_profiles,
      column: %i[practice_id profile_id], primary_key: %i[practice_id id],
      name: "fk_inventory_exception_reviews_profile"

    add_check_constraint :clinic_inventory_exception_reviews,
      "((source_kind='batch' AND category IN ('expiring','expired','inactive_product','inactive_location')) OR " \
        "(source_kind='hold' AND category='hold') OR " \
        "(source_kind='reconciliation' AND category='delivery_discrepancy'))",
      name: "inventory_exception_review_source_category"
    add_check_constraint :clinic_inventory_exception_reviews,
      "state IN ('open','reviewed')",
      name: "inventory_exception_review_state"
    add_check_constraint :clinic_inventory_exception_reviews,
      "length(trim(reason)) BETWEEN 1 AND 200 " \
        "AND (evidence_reference IS NULL OR length(trim(evidence_reference)) BETWEEN 1 AND 200) " \
        "AND request_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' " \
        "AND payload_digest ~ '^[0-9a-f]{64}$'",
      name: "inventory_exception_review_values"

    execute <<~SQL
      CREATE FUNCTION inventory_exception_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.profile_id := inventory_authorize(NEW.practice_id, NEW.actor_id, 'configure', NEW.profile_id);

        IF NEW.assignee_id IS NOT NULL AND NOT EXISTS (
          SELECT 1
            FROM clinic_memberships membership
            JOIN users assignee ON assignee.id = membership.user_id
           WHERE membership.practice_id = NEW.practice_id
             AND membership.user_id = NEW.assignee_id
             AND membership.active
             AND assignee.active
        ) THEN
          RAISE foreign_key_violation USING MESSAGE = 'Exception assignee must be an active clinic member';
        END IF;

        IF NEW.source_kind = 'batch' THEN
          IF NOT EXISTS (
            SELECT 1 FROM clinic_pharmacy_batches
             WHERE practice_id = NEW.practice_id AND id = NEW.source_id
          ) THEN
            RAISE foreign_key_violation USING MESSAGE = 'Exception batch must belong to the clinic';
          END IF;
        ELSIF NEW.source_kind = 'hold' THEN
          IF NOT EXISTS (
            SELECT 1 FROM clinic_inventory_holds
             WHERE practice_id = NEW.practice_id AND id = NEW.source_id
          ) THEN
            RAISE foreign_key_violation USING MESSAGE = 'Exception hold must belong to the clinic';
          END IF;
        ELSIF NEW.source_kind = 'reconciliation' THEN
          IF NOT EXISTS (
            SELECT 1 FROM clinic_inventory_shipment_reconciliations
             WHERE practice_id = NEW.practice_id AND id = NEW.source_id
          ) THEN
            RAISE foreign_key_violation USING MESSAGE = 'Exception reconciliation must belong to the clinic';
          END IF;
        END IF;

        RETURN NEW;
      END $$;

      CREATE TRIGGER inventory_exception_review_guard
      BEFORE INSERT ON clinic_inventory_exception_reviews
      FOR EACH ROW EXECUTE FUNCTION inventory_exception_review_guard();

      CREATE TRIGGER inventory_exception_review_immutable
      BEFORE UPDATE OR DELETE ON clinic_inventory_exception_reviews
      FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Preserve inventory exception review evidence; restore a reviewed backup instead."
  end
end
