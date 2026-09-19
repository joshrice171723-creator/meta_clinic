class CreateSharedDevelopmentDemoLessons < ActiveRecord::Migration[8.1]
  def up
    create_table :development_demo_lessons do |t|
      t.string :lesson_key, null: false
      t.references :practice, null: false, index: false, foreign_key: { to_table: :clinic_practices }
      t.references :operator_user, null: false, index: false, foreign_key: { to_table: :users }
      t.integer :generation, null: false, default: 0
      t.timestamps
    end
    add_index :development_demo_lessons, :lesson_key, unique: true
    add_index :development_demo_lessons, :practice_id, unique: true
    add_index :development_demo_lessons, :operator_user_id, unique: true
    add_check_constraint :development_demo_lessons, "lesson_key <> '' AND generation >= 0",
      name: "development_demo_lessons_values"
    add_index :development_demo_runs, :lesson_key, unique: true,
      where: "active AND lesson_key IS NOT NULL", name: "development_demo_runs_one_active_lesson"

    execute <<~SQL
      CREATE FUNCTION development_demo_reset_allowed(row_data jsonb) RETURNS boolean
      LANGUAGE sql STABLE AS $$
        SELECT current_setting('apply.development_demo_reset_practice_id', true) ~ '^[1-9][0-9]*$'
          AND row_data ? 'practice_id'
          AND row_data->>'practice_id' = current_setting('apply.development_demo_reset_practice_id', true)
          AND EXISTS (
            SELECT 1 FROM development_demo_lessons lesson
            WHERE lesson.practice_id = (row_data->>'practice_id')::bigint
              AND lesson.lesson_key = current_setting('apply.development_demo_reset_lesson_key', true)
          )
      $$;

      DO $guarded_functions$
      DECLARE
        guarded_name text;
        definition text;
        begin_at integer;
      BEGIN
        FOREACH guarded_name IN ARRAY ARRAY[
          'clinic_clinical_linkage_protect', 'clinic_clinical_revision_protect',
          'clinic_lab_report_versions_protect', 'clinic_lab_result_follow_ups_protect',
          'clinic_model_versions_immutable', 'clinic_operation_receipts_immutable',
          'clinic_previsit_notes_protect', 'clinic_task_events_immutable',
          'clinic_telehealth_wrap_ups_protect_finalized', 'guard_invoice_stripe_checkout_routing',
          'guard_stripe_routing', 'inventory_count_session_delete_guard', 'legacy_pharmacy_guard',
          'telehealth_join_grant_freeze', 'telehealth_policy_freeze', 'workforce_adjustment_freeze',
          'workforce_payroll_immutable', 'workforce_timecard_freeze'
        ]
        LOOP
          SELECT pg_get_functiondef(procedure.oid) INTO definition
          FROM pg_proc procedure
          JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
          WHERE namespace.nspname = 'public' AND procedure.proname = guarded_name
            AND procedure.pronargs = 0;
          IF definition IS NULL THEN
            RAISE EXCEPTION 'Missing guarded function %', guarded_name;
          END IF;
          begin_at := strpos(definition, 'BEGIN');
          IF begin_at = 0 THEN
            RAISE EXCEPTION 'Guarded function % has no PL/pgSQL body', guarded_name;
          END IF;
          definition := overlay(definition placing
            'BEGIN' || E'\n  IF TG_OP = ''DELETE'' AND development_demo_reset_allowed(to_jsonb(OLD)) THEN RETURN OLD; END IF;'
            from begin_at for 5);
          EXECUTE definition;
        END LOOP;
      END;
      $guarded_functions$;

      CREATE OR REPLACE FUNCTION erd_immutable_record() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND development_demo_reset_allowed(to_jsonb(OLD)) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'This record is append-only';
      END;
      $$;

      CREATE OR REPLACE FUNCTION inventory_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND development_demo_reset_allowed(to_jsonb(OLD)) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Inventory history is append-only';
      END;
      $$;

      CREATE OR REPLACE FUNCTION inventory_location_delete_guard() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF development_demo_reset_allowed(to_jsonb(OLD)) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Inventory locations must be retired, not deleted';
      END;
      $$;

      CREATE OR REPLACE FUNCTION clinic_encounter_completion_reviews_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP = 'DELETE' AND development_demo_reset_allowed(to_jsonb(OLD)) THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Encounter completion reviews are append-only';
      END;
      $$;

      CREATE OR REPLACE FUNCTION clinic_invoice_line_editable_draft() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE old_status text; new_status text;
      BEGIN
        IF TG_OP = 'DELETE' AND development_demo_reset_allowed(to_jsonb(OLD)) THEN RETURN OLD; END IF;
        SELECT status INTO old_status FROM clinic_invoices WHERE id = OLD.invoice_id;
        IF old_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'This record is append-only'; END IF;
        IF TG_OP = 'UPDATE' THEN
          SELECT status INTO new_status FROM clinic_invoices WHERE id = NEW.invoice_id;
          IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id OR new_status IS DISTINCT FROM 'draft' THEN
            RAISE EXCEPTION 'This record is append-only';
          END IF;
          RETURN NEW;
        END IF;
        RETURN OLD;
      END;
      $$;

      CREATE FUNCTION development_reset_demo_practice(requested_lesson_key text, requested_practice_id bigint)
      RETURNS void LANGUAGE plpgsql AS $$
      DECLARE target record; affected bigint; pass_affected bigint; remaining text; has_rows boolean; pass integer := 0;
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
      "Shared lesson reset preserves fixed clinic identity; reverse it with a reviewed forward migration."
  end
end
