class CreateSubscriptionEntitlementEntries < ActiveRecord::Migration[8.1]
  TABLE = :clinic_subscription_entitlement_entries

  def up
    create_table TABLE do |t|
      t.bigint :practice_id, null: false
      t.bigint :agreement_id, null: false
      t.bigint :service_id, null: false
      t.bigint :actor_id, null: false
      t.string :kind, null: false, limit: 16
      t.integer :quantity, null: false
      t.bigint :reversed_entry_id
      t.string :request_key, null: false, limit: 160
      t.string :source_reference, null: false, limit: 160
      t.timestamps
    end
    add_foreign_key TABLE, :clinic_practices, column: :practice_id
    add_foreign_key TABLE, :users, column: :actor_id
    add_foreign_key TABLE, :clinic_subscription_agreements,
      column: %i[practice_id agreement_id], primary_key: %i[practice_id id]
    add_foreign_key TABLE, :clinic_service_options,
      column: %i[practice_id service_id], primary_key: %i[practice_id id]
    add_index TABLE, %i[practice_id agreement_id request_key], unique: true, name: "subscription_entitlement_request"
    add_index TABLE, %i[practice_id agreement_id service_id], unique: true,
      where: "kind = 'opening'", name: "subscription_entitlement_opening"
    add_index TABLE, :reversed_entry_id, unique: true, where: "reversed_entry_id IS NOT NULL",
      name: "subscription_entitlement_one_reversal"
    add_index TABLE, %i[practice_id agreement_id service_id quantity id], unique: true,
      name: "subscription_entitlement_reversal_identity"
    add_foreign_key TABLE, TABLE,
      column: %i[practice_id agreement_id service_id quantity reversed_entry_id],
      primary_key: %i[practice_id agreement_id service_id quantity id], name: "subscription_entitlement_reversal_scope"
    add_check_constraint TABLE,
      "kind IN ('opening','use','reversal') AND quantity BETWEEN 0 AND 10000 AND " \
      "(kind = 'opening' OR quantity > 0) AND " \
      "((kind = 'reversal') = (reversed_entry_id IS NOT NULL)) AND " \
      "request_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$' AND length(btrim(source_reference)) > 0",
      name: "subscription_entitlement_values"
    execute <<~SQL
      CREATE TRIGGER subscription_entitlement_immutable
      BEFORE UPDATE OR DELETE ON #{TABLE}
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();

      CREATE FUNCTION subscription_entitlement_guard() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE terms jsonb; component jsonb; opening integer; used integer;
      BEGIN
        SELECT snapshot INTO terms FROM clinic_subscription_agreements
          WHERE practice_id = NEW.practice_id AND id = NEW.agreement_id FOR UPDATE;
        SELECT item INTO component FROM jsonb_array_elements(terms -> 'selected_components') item
          WHERE (item ->> 'service_id')::bigint = NEW.service_id;
        IF component IS NULL OR component ->> 'frequency' <> 'term' OR terms ->> 'renewal' = 'automatic' THEN
          RAISE EXCEPTION 'Only purchased fixed-term service units may be recorded';
        END IF;
        IF NEW.kind = 'opening' THEN
          IF NEW.quantity > (component ->> 'quantity')::integer THEN
            RAISE EXCEPTION 'Opening balance exceeds the purchased quantity';
          END IF;
        ELSIF NEW.kind = 'use' THEN
          SELECT quantity INTO opening FROM #{TABLE}
            WHERE practice_id = NEW.practice_id AND agreement_id = NEW.agreement_id
              AND service_id = NEW.service_id AND kind = 'opening';
          SELECT COALESCE(SUM(CASE WHEN kind = 'use' THEN quantity WHEN kind = 'reversal' THEN -quantity ELSE 0 END), 0)
            INTO used FROM #{TABLE} WHERE practice_id = NEW.practice_id
              AND agreement_id = NEW.agreement_id AND service_id = NEW.service_id;
          IF opening IS NULL OR NEW.quantity > opening - used THEN
            RAISE EXCEPTION 'Service use exceeds the recorded remaining quantity';
          END IF;
        ELSIF NOT EXISTS (
          SELECT 1 FROM #{TABLE} WHERE id = NEW.reversed_entry_id AND kind = 'use'
        ) THEN
          RAISE EXCEPTION 'Only a service use entry may be reversed';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER subscription_entitlement_guard
      BEFORE INSERT ON #{TABLE}
      FOR EACH ROW EXECUTE FUNCTION subscription_entitlement_guard();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Package entitlement evidence is retained as immutable history."
  end
end
