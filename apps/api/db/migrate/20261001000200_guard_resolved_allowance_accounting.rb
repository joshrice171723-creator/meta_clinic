class GuardResolvedAllowanceAccounting < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE FUNCTION subscription_allowance_resolution_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE resolution clinic_subscription_paid_period_resolutions%ROWTYPE;
        original clinic_subscription_allowance_entries%ROWTYPE;
        accounted timestamp; competing bigint[]; retained bigint[];
      BEGIN
        PERFORM 1 FROM clinic_subscription_agreements
          WHERE practice_id = NEW.practice_id AND id = NEW.agreement_id FOR UPDATE;
        IF NEW.kind = 'reversal' THEN
          SELECT * INTO original FROM clinic_subscription_allowance_entries WHERE id = NEW.reversed_entry_id;
          IF NEW.period_resolution_id IS DISTINCT FROM original.period_resolution_id THEN
            RAISE EXCEPTION 'Reversal must retain original paid-period resolution identity';
          END IF;
          RETURN NEW;
        END IF;
        accounted := COALESCE(NEW.accounted_at, NEW.created_at);
        SELECT array_agg(id ORDER BY id) INTO competing FROM clinic_subscription_events
          WHERE practice_id = NEW.practice_id AND agreement_id = NEW.agreement_id AND kind = 'active'
            AND ((details ->> 'starts_at')::timestamptz AT TIME ZONE 'UTC') <= accounted
            AND accounted < ((details ->> 'ends_at')::timestamptz AT TIME ZONE 'UTC');
        IF competing IS NULL OR NOT NEW.paid_event_id = ANY(competing) THEN
          RAISE EXCEPTION 'Allowance use requires a paid period covering the accounting time';
        END IF;
        IF cardinality(competing) > 1 AND NEW.period_resolution_id IS NULL THEN
          RAISE EXCEPTION 'Competing paid periods require an explicit resolution';
        END IF;
        IF NEW.period_resolution_id IS NOT NULL THEN
          SELECT * INTO resolution FROM clinic_subscription_paid_period_resolutions
            WHERE id = NEW.period_resolution_id AND practice_id = NEW.practice_id
              AND agreement_id = NEW.agreement_id AND service_id = NEW.service_id;
          SELECT array_agg(value::text::bigint ORDER BY value::text::bigint) INTO retained
            FROM jsonb_array_elements(resolution.candidate_event_ids);
          IF resolution.id IS NULL OR resolution.selected_paid_event_id <> NEW.paid_event_id
            OR resolution.effective_at > accounted OR accounted < resolution.overlap_start
            OR accounted >= resolution.overlap_end OR competing IS DISTINCT FROM retained
            OR resolution.effective_at >= NEW.window_end OR resolution.overlap_end <= NEW.window_start THEN
            RAISE EXCEPTION 'Allowance use does not match selected paid-period resolution';
          END IF;
        END IF;
        IF EXISTS (
          SELECT 1 FROM clinic_subscription_allowance_entries used
          WHERE used.practice_id = NEW.practice_id AND used.agreement_id = NEW.agreement_id
            AND used.service_id = NEW.service_id AND used.kind = 'use' AND used.paid_event_id <> NEW.paid_event_id
            AND used.window_start < NEW.window_end AND NEW.window_start < used.window_end
            AND NOT EXISTS (SELECT 1 FROM clinic_subscription_allowance_entries reversal
              WHERE reversal.reversed_entry_id = used.id)
        ) THEN
          RAISE EXCEPTION 'Another paid-period window retains unreversed allowance use';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER subscription_allowance_resolution_guard
        BEFORE INSERT ON clinic_subscription_allowance_entries
        FOR EACH ROW EXECUTE FUNCTION subscription_allowance_resolution_guard();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Selected paid-period accounting evidence is retained."
  end
end
