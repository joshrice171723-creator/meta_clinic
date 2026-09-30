class CreateSubscriptionAllowanceEntries < ActiveRecord::Migration[8.1]
  TABLE = :clinic_subscription_allowance_entries

  def up
    create_table TABLE do |t|
      t.bigint :practice_id, null: false
      t.bigint :agreement_id, null: false
      t.bigint :service_id, null: false
      t.bigint :paid_event_id, null: false
      t.bigint :actor_id, null: false
      t.string :kind, null: false, limit: 16
      t.integer :quantity, null: false
      t.datetime :window_start, null: false
      t.datetime :window_end, null: false
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
    add_index :clinic_subscription_events, %i[practice_id agreement_id id], unique: true,
      name: "subscription_event_allowance_identity"
    add_foreign_key TABLE, :clinic_subscription_events,
      column: %i[practice_id agreement_id paid_event_id], primary_key: %i[practice_id agreement_id id]
    add_index TABLE, %i[practice_id agreement_id request_key], unique: true, name: "subscription_allowance_request"
    add_index TABLE, :reversed_entry_id, unique: true, where: "reversed_entry_id IS NOT NULL",
      name: "subscription_allowance_one_reversal"
    add_foreign_key TABLE, TABLE, column: :reversed_entry_id
    add_check_constraint TABLE,
      "kind IN ('use','reversal') AND quantity BETWEEN 1 AND 10000 AND window_end > window_start AND " \
      "((kind = 'reversal') = (reversed_entry_id IS NOT NULL)) AND " \
      "request_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$' AND length(btrim(source_reference)) > 0",
      name: "subscription_allowance_values"
    execute <<~SQL
      CREATE TRIGGER subscription_allowance_immutable BEFORE UPDATE OR DELETE ON #{TABLE}
        FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
      CREATE FUNCTION subscription_allowance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE terms jsonb; component jsonb; paid jsonb; anchor timestamp; finish timestamp;
        step interval; n integer; expected_start timestamp; expected_end timestamp; consumed bigint;
        original #{TABLE}%ROWTYPE;
      BEGIN
        SELECT snapshot INTO terms FROM clinic_subscription_agreements
          WHERE practice_id = NEW.practice_id AND id = NEW.agreement_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM clinic_subscription_entitlement_entries WHERE practice_id = NEW.practice_id
          AND agreement_id = NEW.agreement_id AND request_key = NEW.request_key) THEN
          RAISE EXCEPTION 'Request key was already used in the fixed-term ledger';
        END IF;
        SELECT item INTO component FROM jsonb_array_elements(terms -> 'selected_components') item
          WHERE (item ->> 'service_id')::bigint = NEW.service_id;
        IF component IS NULL OR component -> 'allowance' IS DISTINCT FROM
          '{"anchor":"paid_period_start","timezone":"UTC","reset":"discard_unused","renewal":"verified_paid_period","partial_window":"full_quantity"}'::jsonb THEN
          RAISE EXCEPTION 'Purchased allowance policy is unconfigured';
        END IF;
        SELECT details INTO paid FROM clinic_subscription_events WHERE practice_id = NEW.practice_id
          AND agreement_id = NEW.agreement_id AND id = NEW.paid_event_id AND kind = 'active';
        IF paid IS NULL THEN RAISE EXCEPTION 'Allowance requires retained paid activation'; END IF;
        anchor := (paid ->> 'starts_at')::timestamptz AT TIME ZONE 'UTC';
        finish := (paid ->> 'ends_at')::timestamptz AT TIME ZONE 'UTC';
        IF component ->> 'frequency' = 'term' THEN
          expected_start := anchor; expected_end := finish;
        ELSE
          CASE component ->> 'frequency'
            WHEN 'day' THEN step := interval '1 day'; n := floor(extract(epoch FROM NEW.window_start - anchor) / 86400);
            WHEN 'week' THEN step := interval '7 days'; n := floor(extract(epoch FROM NEW.window_start - anchor) / 604800);
            WHEN 'month' THEN step := interval '1 month';
              n := (extract(year FROM NEW.window_start) - extract(year FROM anchor)) * 12
                + extract(month FROM NEW.window_start) - extract(month FROM anchor);
            ELSE RAISE EXCEPTION 'Unsupported allowance frequency';
          END CASE;
          IF n < 0 THEN RAISE EXCEPTION 'Allowance precedes paid period'; END IF;
          expected_start := anchor + n * step;
          expected_end := LEAST(anchor + (n + 1) * step, finish);
        END IF;
        IF NEW.window_start IS DISTINCT FROM expected_start OR NEW.window_end IS DISTINCT FROM expected_end
          OR NEW.window_start < anchor OR NEW.window_end > finish THEN
          RAISE EXCEPTION 'Allowance window does not match retained terms';
        END IF;
        IF NEW.kind = 'reversal' THEN
          SELECT * INTO original FROM #{TABLE} WHERE id = NEW.reversed_entry_id;
          IF original.id IS NULL OR original.kind <> 'use' OR
            (original.practice_id, original.agreement_id, original.service_id, original.quantity,
              original.paid_event_id, original.window_start, original.window_end) IS DISTINCT FROM
            (NEW.practice_id, NEW.agreement_id, NEW.service_id, NEW.quantity,
              NEW.paid_event_id, NEW.window_start, NEW.window_end) THEN
            RAISE EXCEPTION 'Reversal must retain exact original use identity and window';
          END IF;
        ELSE
          SELECT COALESCE(SUM(CASE WHEN kind = 'use' THEN quantity ELSE -quantity END), 0)
            INTO consumed FROM #{TABLE} WHERE practice_id = NEW.practice_id AND agreement_id = NEW.agreement_id
              AND service_id = NEW.service_id AND paid_event_id = NEW.paid_event_id
              AND window_start = NEW.window_start AND window_end = NEW.window_end;
          IF NEW.quantity > (component ->> 'quantity')::integer - consumed THEN
            RAISE EXCEPTION 'Service use exceeds remaining allowance';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE FUNCTION subscription_fixed_allowance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE terms jsonb; component jsonb;
      BEGIN
        SELECT snapshot INTO terms FROM clinic_subscription_agreements
          WHERE practice_id = NEW.practice_id AND id = NEW.agreement_id FOR UPDATE;
        SELECT item INTO component FROM jsonb_array_elements(terms -> 'selected_components') item
          WHERE (item ->> 'service_id')::bigint = NEW.service_id;
        IF component -> 'allowance' IS NOT NULL AND component -> 'allowance' <> 'null'::jsonb THEN
          RAISE EXCEPTION 'Configured allowances require the recurring window ledger';
        END IF;
        IF EXISTS (SELECT 1 FROM #{TABLE} WHERE practice_id = NEW.practice_id
          AND agreement_id = NEW.agreement_id AND request_key = NEW.request_key) THEN
          RAISE EXCEPTION 'Request key was already used in the recurring ledger';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER subscription_fixed_allowance_guard BEFORE INSERT ON clinic_subscription_entitlement_entries
        FOR EACH ROW EXECUTE FUNCTION subscription_fixed_allowance_guard();
      CREATE TRIGGER subscription_allowance_guard BEFORE INSERT ON #{TABLE}
        FOR EACH ROW EXECUTE FUNCTION subscription_allowance_guard();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Allowance use and reversal evidence is retained."
  end
end
