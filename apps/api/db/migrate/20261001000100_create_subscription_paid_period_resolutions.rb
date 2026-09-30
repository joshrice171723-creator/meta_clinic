class CreateSubscriptionPaidPeriodResolutions < ActiveRecord::Migration[8.1]
  TABLE = :clinic_subscription_paid_period_resolutions

  def up
    create_table TABLE do |t|
      t.bigint :practice_id, null: false
      t.bigint :agreement_id, null: false
      t.bigint :service_id, null: false
      t.bigint :selected_paid_event_id, null: false
      t.bigint :actor_id, null: false
      t.jsonb :candidate_event_ids, null: false
      t.jsonb :evidence_snapshot, null: false
      t.string :evidence_token, null: false, limit: 64
      t.datetime :overlap_start, null: false
      t.datetime :overlap_end, null: false
      t.datetime :effective_at, null: false
      t.string :reason, null: false, limit: 1000
      t.string :request_key, null: false, limit: 160
      t.timestamps
    end
    add_foreign_key TABLE, :clinic_practices, column: :practice_id
    add_foreign_key TABLE, :users, column: :actor_id
    add_foreign_key TABLE, :clinic_subscription_agreements,
      column: %i[practice_id agreement_id], primary_key: %i[practice_id id]
    add_foreign_key TABLE, :clinic_service_options,
      column: %i[practice_id service_id], primary_key: %i[practice_id id]
    add_foreign_key TABLE, :clinic_subscription_events,
      column: %i[practice_id agreement_id selected_paid_event_id], primary_key: %i[practice_id agreement_id id]
    add_index TABLE, %i[practice_id agreement_id request_key], unique: true,
      name: "subscription_paid_resolution_request"
    add_index TABLE, %i[practice_id agreement_id service_id evidence_token], unique: true,
      name: "subscription_paid_resolution_evidence"
    add_index TABLE, %i[practice_id agreement_id service_id id], unique: true,
      name: "subscription_paid_resolution_identity"
    add_column :clinic_subscription_allowance_entries, :period_resolution_id, :bigint
    add_column :clinic_subscription_allowance_entries, :accounted_at, :datetime
    add_foreign_key :clinic_subscription_allowance_entries, TABLE,
      column: %i[practice_id agreement_id service_id period_resolution_id],
      primary_key: %i[practice_id agreement_id service_id id], name: "subscription_allowance_resolution_scope"
    add_check_constraint TABLE,
      "jsonb_typeof(candidate_event_ids) = 'array' AND jsonb_typeof(evidence_snapshot) = 'object' AND " \
      "evidence_token ~ '^[0-9a-f]{64}$' AND overlap_start <= effective_at AND effective_at < overlap_end AND " \
      "reason ~ '[^[:space:]]' AND request_key ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$'",
      name: "subscription_paid_resolution_values"
    execute <<~SQL
      CREATE TRIGGER subscription_paid_resolution_immutable BEFORE UPDATE OR DELETE ON #{TABLE}
        FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
      CREATE FUNCTION subscription_paid_resolution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE candidate jsonb; candidate_id bigint; paid jsonb; retained jsonb; period_start timestamp; period_end timestamp;
        terms jsonb; component jsonb; actual bigint[];
        seen bigint[] := ARRAY[]::bigint[];
      BEGIN
        SELECT snapshot INTO terms FROM clinic_subscription_agreements
          WHERE practice_id = NEW.practice_id AND id = NEW.agreement_id FOR UPDATE;
        SELECT item INTO component FROM jsonb_array_elements(terms -> 'selected_components') item
          WHERE (item ->> 'service_id')::bigint = NEW.service_id;
        IF component IS NULL OR component -> 'allowance' IS DISTINCT FROM
          '{"anchor":"paid_period_start","timezone":"UTC","reset":"discard_unused","renewal":"verified_paid_period","partial_window":"full_quantity"}'::jsonb THEN
          RAISE EXCEPTION 'Purchased allowance policy is unconfigured';
        END IF;
        IF jsonb_typeof(NEW.candidate_event_ids) IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Paid period candidates must be an array';
        END IF;
        IF jsonb_array_length(NEW.candidate_event_ids) < 2 THEN
          RAISE EXCEPTION 'Paid period resolution requires competing events';
        END IF;
        IF jsonb_typeof(NEW.evidence_snapshot -> 'events') IS DISTINCT FROM 'array' THEN
          RAISE EXCEPTION 'Resolution snapshot must retain paid events';
        END IF;
        IF jsonb_array_length(NEW.evidence_snapshot -> 'events') <> jsonb_array_length(NEW.candidate_event_ids) THEN
          RAISE EXCEPTION 'Resolution snapshot must retain every competing event exactly once';
        END IF;
        FOR candidate IN SELECT value FROM jsonb_array_elements(NEW.candidate_event_ids) LOOP
          IF jsonb_typeof(candidate) IS DISTINCT FROM 'number' OR candidate::text !~ '^[1-9][0-9]{0,18}$' THEN
            RAISE EXCEPTION 'Paid period candidate must be a positive integer ID';
          END IF;
          candidate_id := candidate::text::bigint;
          IF candidate_id = ANY(seen) THEN
            RAISE EXCEPTION 'Paid period candidates must be distinct';
          END IF;
          seen := array_append(seen, candidate_id);
          SELECT details INTO paid FROM clinic_subscription_events
            WHERE practice_id = NEW.practice_id AND agreement_id = NEW.agreement_id
              AND id = candidate_id AND kind = 'active';
          IF paid IS NULL THEN
            RAISE EXCEPTION 'Paid period candidate must be retained scoped activation evidence';
          END IF;
          SELECT item INTO retained FROM jsonb_array_elements(NEW.evidence_snapshot -> 'events') item
            WHERE item -> 'id' = to_jsonb(candidate_id);
          IF retained IS NULL OR retained -> 'details' IS DISTINCT FROM paid OR
            (SELECT count(*) FROM jsonb_array_elements(NEW.evidence_snapshot -> 'events') item
              WHERE item -> 'id' = to_jsonb(candidate_id)) <> 1 THEN
            RAISE EXCEPTION 'Resolution snapshot must preserve exact retained paid event details';
          END IF;
          period_start := (paid ->> 'starts_at')::timestamptz AT TIME ZONE 'UTC';
          period_end := (paid ->> 'ends_at')::timestamptz AT TIME ZONE 'UTC';
          IF period_start IS NULL OR period_end IS NULL OR period_start >= period_end
            OR NEW.overlap_start < period_start OR NEW.overlap_end > period_end THEN
            RAISE EXCEPTION 'Resolution overlap must remain within every retained paid period';
          END IF;
        END LOOP;
        SELECT array_agg(id ORDER BY id) INTO actual FROM clinic_subscription_events
          WHERE practice_id = NEW.practice_id AND agreement_id = NEW.agreement_id AND kind = 'active'
            AND ((details ->> 'starts_at')::timestamptz AT TIME ZONE 'UTC') <= NEW.effective_at
            AND NEW.effective_at < ((details ->> 'ends_at')::timestamptz AT TIME ZONE 'UTC');
        IF actual IS DISTINCT FROM ARRAY(SELECT value FROM unnest(seen) value ORDER BY value) THEN
          RAISE EXCEPTION 'Resolution must retain the complete competing paid-event set';
        END IF;
        IF NOT NEW.selected_paid_event_id = ANY(seen) THEN
          RAISE EXCEPTION 'Selected paid event must belong to the competing set';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER subscription_paid_resolution_guard BEFORE INSERT ON #{TABLE}
        FOR EACH ROW EXECUTE FUNCTION subscription_paid_resolution_guard();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Paid period resolution evidence is retained as immutable history."
  end
end
