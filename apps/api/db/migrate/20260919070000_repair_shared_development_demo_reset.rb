class RepairSharedDevelopmentDemoReset < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      CREATE FUNCTION development_demo_reset_legacy_stock_allowed(requested_item_id bigint) RETURNS boolean
      LANGUAGE sql STABLE AS $$
        SELECT current_setting('apply.development_demo_reset_practice_id', true) ~ '^[1-9][0-9]*$'
          AND EXISTS (
            SELECT 1
            FROM clinic_items item
            JOIN development_demo_lessons lesson ON lesson.practice_id = item.practice_id
            WHERE item.id = requested_item_id
              AND item.practice_id::text = current_setting('apply.development_demo_reset_practice_id', true)
              AND lesson.lesson_key = current_setting('apply.development_demo_reset_lesson_key', true)
          )
      $$;

      CREATE OR REPLACE FUNCTION inventory_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND (
          development_demo_reset_allowed(to_jsonb(OLD)) OR
          (TG_TABLE_NAME = 'clinic_stock_movements' AND
            development_demo_reset_legacy_stock_allowed((to_jsonb(OLD)->>'item_id')::bigint))
        ) THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION 'Inventory history is append-only';
      END;
      $$;

      CREATE OR REPLACE FUNCTION development_reset_demo_practice(
        requested_lesson_key text, requested_practice_id bigint
      ) RETURNS void LANGUAGE plpgsql AS $$
      DECLARE
        target record;
        affected bigint;
        pass_affected bigint;
        remaining text;
        has_rows boolean;
        pass integer := 0;
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM development_demo_lessons lesson
          WHERE lesson.lesson_key = requested_lesson_key AND lesson.practice_id = requested_practice_id
          FOR UPDATE
        ) THEN
          RAISE EXCEPTION 'Demo reset target is not a registered lesson clinic';
        END IF;

        PERFORM set_config('apply.development_demo_reset_practice_id', requested_practice_id::text, true);
        PERFORM set_config('apply.development_demo_reset_lesson_key', requested_lesson_key, true);

        UPDATE clinic_patients SET primary_address_version_id = NULL
          WHERE practice_id = requested_practice_id AND primary_address_version_id IS NOT NULL;
        UPDATE clinic_inventory_suppliers SET primary_address_version_id = NULL
          WHERE practice_id = requested_practice_id AND primary_address_version_id IS NOT NULL;
        UPDATE clinic_staff_members SET primary_address_version_id = NULL
          WHERE practice_id = requested_practice_id AND primary_address_version_id IS NOT NULL;
        UPDATE clinic_telehealth_settings SET active_policy_version_id = NULL
          WHERE practice_id = requested_practice_id AND active_policy_version_id IS NOT NULL;
        UPDATE clinic_telehealth_visits
          SET current_room_attempt_id = NULL, scribe_capture_owner_participant_id = NULL
          WHERE practice_id = requested_practice_id
            AND (current_room_attempt_id IS NOT NULL OR scribe_capture_owner_participant_id IS NOT NULL);
        UPDATE clinic_telehealth_participants SET admitted_checkin_id = NULL
          WHERE practice_id = requested_practice_id AND admitted_checkin_id IS NOT NULL;
        UPDATE clinic_scribe_documents SET current_draft_id = NULL
          WHERE practice_id = requested_practice_id AND current_draft_id IS NOT NULL;
        UPDATE clinic_inventory_purchase_cart_items SET purchase_order_line_id = NULL
          WHERE practice_id = requested_practice_id AND purchase_order_line_id IS NOT NULL;
        UPDATE clinic_inventory_purchase_order_lines SET cart_item_id = NULL
          WHERE practice_id = requested_practice_id AND cart_item_id IS NOT NULL;
        UPDATE clinic_lab_reports SET current_version_id = NULL
          WHERE practice_id = requested_practice_id AND current_version_id IS NOT NULL;
        UPDATE clinic_subscription_packages SET published_version_id = NULL
          WHERE practice_id = requested_practice_id AND published_version_id IS NOT NULL;

        DELETE FROM clinic_stock_movements movement
        USING clinic_items item
        WHERE movement.item_id = item.id AND item.practice_id = requested_practice_id;

        LOOP
          pass := pass + 1;
          pass_affected := 0;
          FOR target IN
            SELECT quote_ident(table_name) AS table_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'practice_id'
              AND left(table_name, 7) = 'clinic_'
              AND table_name NOT IN ('clinic_memberships', 'clinic_role_grants', 'clinic_role_grant_events')
            ORDER BY table_name
          LOOP
            BEGIN
              EXECUTE format('DELETE FROM public.%s WHERE practice_id = $1', target.table_name)
                USING requested_practice_id;
              GET DIAGNOSTICS affected = ROW_COUNT;
              pass_affected := pass_affected + affected;
            EXCEPTION WHEN foreign_key_violation THEN
              NULL;
            END;
          END LOOP;

          remaining := NULL;
          FOR target IN
            SELECT quote_ident(table_name) AS table_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND column_name = 'practice_id'
              AND left(table_name, 7) = 'clinic_'
              AND table_name NOT IN ('clinic_memberships', 'clinic_role_grants', 'clinic_role_grant_events')
            ORDER BY table_name
          LOOP
            EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%s WHERE practice_id = $1)', target.table_name)
              INTO has_rows USING requested_practice_id;
            IF has_rows THEN
              remaining := concat_ws(', ', remaining, target.table_name);
            END IF;
          END LOOP;
          EXIT WHEN remaining IS NULL;
          IF pass_affected = 0 OR pass >= 300 THEN
            RAISE EXCEPTION 'Demo reset could not clear registered lesson clinic tables: %', remaining;
          END IF;
        END LOOP;

        PERFORM set_config('apply.development_demo_reset_practice_id', '', true);
        PERFORM set_config('apply.development_demo_reset_lesson_key', '', true);
      END;
      $$;
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Shared lesson reset repair is forward-only because migration 20260919060000 is already applied."
  end
end
