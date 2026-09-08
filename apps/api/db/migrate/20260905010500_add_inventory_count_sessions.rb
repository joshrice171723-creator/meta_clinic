class AddInventoryCountSessions < ActiveRecord::Migration[8.1]
  def up
    create_table :clinic_inventory_count_sessions do |t|
      t.bigint :practice_id, :location_id, :actor_id, :assignee_id, null: false
      t.date :due_on, null: false
      t.boolean :blind, null: false, default: true
      t.bigint :scope_transaction_id, null: false, default: -> { "txid_current()" }
      t.string :status, :reason, :request_key, :payload_digest, null: false
      t.timestamps
    end
    add_index :clinic_inventory_count_sessions, %i[practice_id id], unique: true,
      name: "inventory_count_sessions_practice_id"
    add_index :clinic_inventory_count_sessions, %i[practice_id request_key], unique: true,
      name: "inventory_count_session_retry"
    add_index :clinic_inventory_count_sessions, %i[practice_id location_id], unique: true,
      where: "status='open'", name: "inventory_count_session_open_bin"
    add_foreign_key :clinic_inventory_count_sessions, :clinic_practices,
      column: :practice_id, name: "fk_inventory_count_sessions_practice"
    add_foreign_key :clinic_inventory_count_sessions, :clinic_inventory_locations,
      column: %i[practice_id location_id], primary_key: %i[practice_id id],
      name: "fk_inventory_count_sessions_location"
    add_foreign_key :clinic_inventory_count_sessions, :clinic_memberships,
      column: %i[practice_id actor_id], primary_key: %i[practice_id user_id],
      name: "fk_inventory_count_sessions_actor"
    add_foreign_key :clinic_inventory_count_sessions, :clinic_memberships,
      column: %i[practice_id assignee_id], primary_key: %i[practice_id user_id],
      name: "fk_inventory_count_sessions_assignee"
    add_check_constraint :clinic_inventory_count_sessions,
      "status IN ('open','completed','cancelled')", name: "inventory_count_session_status"
    add_check_constraint :clinic_inventory_count_sessions,
      "length(trim(reason)) BETWEEN 1 AND 200 " \
        "AND request_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' " \
        "AND payload_digest ~ '^[0-9a-f]{64}$'",
      name: "inventory_count_session_values"

    create_table :clinic_inventory_count_session_lines do |t|
      t.bigint :practice_id, :count_session_id, :batch_id, null: false
      t.timestamps
    end
    add_index :clinic_inventory_count_session_lines, %i[practice_id id], unique: true,
      name: "inventory_count_session_lines_practice_id"
    add_index :clinic_inventory_count_session_lines, %i[practice_id count_session_id batch_id], unique: true,
      name: "inventory_count_session_line_scope"
    add_index :clinic_inventory_count_session_lines, %i[practice_id count_session_id id],
      name: "inventory_count_session_lines_worklist"
    add_foreign_key :clinic_inventory_count_session_lines, :clinic_practices,
      column: :practice_id, name: "fk_inventory_count_session_lines_practice"
    add_foreign_key :clinic_inventory_count_session_lines, :clinic_inventory_count_sessions,
      column: %i[practice_id count_session_id], primary_key: %i[practice_id id],
      name: "fk_inventory_count_session_lines_session"
    add_foreign_key :clinic_inventory_count_session_lines, :clinic_pharmacy_batches,
      column: %i[practice_id batch_id], primary_key: %i[practice_id id],
      name: "fk_inventory_count_session_lines_batch"

    add_column :clinic_inventory_counts, :count_session_line_id, :bigint
    add_index :clinic_inventory_counts, %i[practice_id count_session_line_id id],
      name: "inventory_counts_session_line_history"
    add_foreign_key :clinic_inventory_counts, :clinic_inventory_count_session_lines,
      column: %i[practice_id count_session_line_id], primary_key: %i[practice_id id],
      name: "fk_inventory_counts_session_line"

    create_table :clinic_inventory_count_session_events do |t|
      t.bigint :practice_id, :count_session_id, :actor_id, null: false
      t.bigint :count_session_line_id, :count_id, :assignee_id
      t.string :kind, :reason, :request_key, :payload_digest, null: false
      t.timestamps
    end
    add_index :clinic_inventory_count_session_events, %i[practice_id id], unique: true,
      name: "inventory_count_session_events_practice_id"
    add_index :clinic_inventory_count_session_events, %i[practice_id request_key], unique: true,
      name: "inventory_count_session_event_retry"
    add_index :clinic_inventory_count_session_events, %i[practice_id count_session_id id],
      order: { id: :desc }, name: "inventory_count_session_events_history"
    add_index :clinic_inventory_count_session_events, %i[practice_id count_session_line_id id],
      order: { id: :desc }, name: "inventory_count_session_line_events"
    add_foreign_key :clinic_inventory_count_session_events, :clinic_practices,
      column: :practice_id, name: "fk_inventory_count_session_events_practice"
    add_foreign_key :clinic_inventory_count_session_events, :clinic_inventory_count_sessions,
      column: %i[practice_id count_session_id], primary_key: %i[practice_id id],
      name: "fk_inventory_count_session_events_session"
    add_foreign_key :clinic_inventory_count_session_events, :clinic_inventory_count_session_lines,
      column: %i[practice_id count_session_line_id], primary_key: %i[practice_id id],
      name: "fk_inventory_count_session_events_line"
    add_foreign_key :clinic_inventory_count_session_events, :clinic_inventory_counts,
      column: %i[practice_id count_id], primary_key: %i[practice_id id],
      name: "fk_inventory_count_session_events_count"
    add_foreign_key :clinic_inventory_count_session_events, :clinic_memberships,
      column: %i[practice_id actor_id], primary_key: %i[practice_id user_id],
      name: "fk_inventory_count_session_events_actor"
    add_foreign_key :clinic_inventory_count_session_events, :clinic_memberships,
      column: %i[practice_id assignee_id], primary_key: %i[practice_id user_id],
      name: "fk_inventory_count_session_events_assignee"
    add_check_constraint :clinic_inventory_count_session_events,
      "kind IN ('observed','skipped','resumed','reassigned','completed','cancelled')",
      name: "inventory_count_session_event_kind"
    add_check_constraint :clinic_inventory_count_session_events,
      "((kind='observed' AND count_session_line_id IS NOT NULL AND count_id IS NOT NULL AND assignee_id IS NULL) " \
        "OR (kind IN ('skipped','resumed') AND count_session_line_id IS NOT NULL AND count_id IS NULL AND assignee_id IS NULL) " \
        "OR (kind='reassigned' AND count_session_line_id IS NULL AND count_id IS NULL AND assignee_id IS NOT NULL) " \
        "OR (kind IN ('completed','cancelled') AND count_session_line_id IS NULL AND count_id IS NULL AND assignee_id IS NULL))",
      name: "inventory_count_session_event_shape"
    add_check_constraint :clinic_inventory_count_session_events,
      "length(trim(reason)) BETWEEN 1 AND 200 " \
        "AND request_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' " \
        "AND payload_digest ~ '^[0-9a-f]{64}$'",
      name: "inventory_count_session_event_values"

    execute <<~SQL
      CREATE FUNCTION inventory_count_session_ready(session bigint, clinic bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (
          SELECT 1 FROM clinic_inventory_count_session_lines
           WHERE practice_id=clinic AND count_session_id=session
        ) AND NOT EXISTS (
          SELECT 1
            FROM clinic_inventory_count_session_lines line
            JOIN clinic_pharmacy_batches batch
              ON batch.practice_id=line.practice_id AND batch.id=line.batch_id
            LEFT JOIN LATERAL (
              SELECT event.kind,event.count_id
                FROM clinic_inventory_count_session_events event
               WHERE event.practice_id=line.practice_id
                 AND event.count_session_line_id=line.id
                 AND event.kind IN ('observed','skipped','resumed')
               ORDER BY event.id DESC LIMIT 1
            ) latest_event ON true
            LEFT JOIN LATERAL (
              SELECT observation.*
                FROM clinic_inventory_counts observation
               WHERE observation.practice_id=line.practice_id
                 AND observation.count_session_line_id=line.id
               ORDER BY observation.id DESC LIMIT 1
            ) latest_count ON true
            LEFT JOIN clinic_inventory_count_approvals approval
              ON approval.practice_id=latest_count.practice_id AND approval.count_id=latest_count.id
            LEFT JOIN LATERAL (
              SELECT MAX(entry.id) AS cutoff
                FROM clinic_inventory_entries entry
               WHERE entry.practice_id=line.practice_id
                 AND entry.stock_type='pharmacy'
                 AND entry.batch_id=line.batch_id
            ) movement ON true
           WHERE line.practice_id=clinic AND line.count_session_id=session
             AND NOT COALESCE(
               latest_event.kind='skipped' OR (
                 latest_event.kind='observed'
                 AND latest_event.count_id=latest_count.id
                 AND batch.on_hand=latest_count.observed_quantity
                 AND (
                   (latest_count.expected_quantity=latest_count.observed_quantity
                     AND movement.cutoff IS NOT DISTINCT FROM latest_count.cutoff_entry_id)
                   OR
                   (latest_count.expected_quantity<>latest_count.observed_quantity
                     AND approval.entry_id IS NOT NULL AND movement.cutoff=approval.entry_id)
                 )
               ), false
             )
        )
      $$;

      CREATE FUNCTION inventory_count_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE latest_kind text; latest_assignee bigint;
      BEGIN
        IF TG_OP='INSERT' THEN
          PERFORM 1 FROM clinic_practices WHERE id=NEW.practice_id FOR UPDATE;
          PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,'configure');
          IF NEW.status<>'open' THEN RAISE EXCEPTION 'A count session must start open'; END IF;
        ELSE
          IF (
            NEW.practice_id,NEW.location_id,NEW.actor_id,NEW.due_on,NEW.blind,
            NEW.reason,NEW.request_key,NEW.payload_digest,NEW.scope_transaction_id,NEW.created_at
          ) IS DISTINCT FROM (
            OLD.practice_id,OLD.location_id,OLD.actor_id,OLD.due_on,OLD.blind,
            OLD.reason,OLD.request_key,OLD.payload_digest,OLD.scope_transaction_id,OLD.created_at
          ) THEN
            RAISE EXCEPTION 'Count session scope and evidence are immutable';
          END IF;
          IF OLD.status<>'open' AND (NEW.status,NEW.assignee_id) IS DISTINCT FROM (OLD.status,OLD.assignee_id) THEN
            RAISE EXCEPTION 'A completed or cancelled count session cannot change';
          END IF;
          IF NEW.status IS DISTINCT FROM OLD.status THEN
            SELECT kind INTO latest_kind FROM clinic_inventory_count_session_events
             WHERE practice_id=NEW.practice_id AND count_session_id=NEW.id
               AND kind IN ('reassigned','completed','cancelled') ORDER BY id DESC LIMIT 1;
            IF NEW.status NOT IN ('completed','cancelled') OR latest_kind IS DISTINCT FROM NEW.status THEN
              RAISE EXCEPTION 'Count session status needs matching event evidence';
            END IF;
          END IF;
          IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
            SELECT kind,assignee_id INTO latest_kind,latest_assignee
              FROM clinic_inventory_count_session_events
             WHERE practice_id=NEW.practice_id AND count_session_id=NEW.id
               AND kind IN ('reassigned','completed','cancelled') ORDER BY id DESC LIMIT 1;
            IF latest_kind IS DISTINCT FROM 'reassigned' OR latest_assignee IS DISTINCT FROM NEW.assignee_id THEN
              RAISE EXCEPTION 'Count session assignment needs matching event evidence';
            END IF;
          END IF;
        END IF;

        IF TG_OP='INSERT' THEN
          IF NOT EXISTS (
            SELECT 1 FROM clinic_inventory_locations location
             WHERE location.practice_id=NEW.practice_id AND location.id=NEW.location_id
               AND location.status='active'
               AND NOT EXISTS (
                 SELECT 1 FROM clinic_inventory_locations child
                  WHERE child.practice_id=location.practice_id AND child.parent_location_id=location.id
               )
               AND (location.site_id IS NULL OR EXISTS (
                 SELECT 1 FROM clinic_sites site
                  WHERE site.practice_id=location.practice_id AND site.id=location.site_id AND site.status='active'
               ))
          ) THEN RAISE EXCEPTION 'Count sessions require an active inventory bin at an active facility'; END IF;
        END IF;
        IF TG_OP='INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
          PERFORM inventory_authorize(NEW.practice_id,NEW.assignee_id,'count');
        END IF;
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_count_session_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Count sessions are retained as inventory evidence';
      END $$;

      CREATE FUNCTION inventory_count_session_scope_complete() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE position_count integer; line_count integer;
      BEGIN
        SELECT COUNT(*) INTO position_count FROM clinic_pharmacy_batches
         WHERE practice_id=NEW.practice_id AND location_id=NEW.location_id;
        SELECT COUNT(*) INTO line_count FROM clinic_inventory_count_session_lines
         WHERE practice_id=NEW.practice_id AND count_session_id=NEW.id;
        IF position_count NOT BETWEEN 1 AND 500 OR line_count<>position_count OR EXISTS (
          SELECT 1 FROM clinic_pharmacy_batches batch
           WHERE batch.practice_id=NEW.practice_id AND batch.location_id=NEW.location_id
             AND NOT EXISTS (
               SELECT 1 FROM clinic_inventory_count_session_lines line
                WHERE line.practice_id=NEW.practice_id AND line.count_session_id=NEW.id
                  AND line.batch_id=batch.id
             )
        ) THEN RAISE EXCEPTION 'Count session must freeze every recorded position in its inventory bin'; END IF;
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_count_session_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE locked_session clinic_inventory_count_sessions%ROWTYPE; position_count integer;
      BEGIN
        SELECT * INTO locked_session FROM clinic_inventory_count_sessions
         WHERE practice_id=NEW.practice_id AND id=NEW.count_session_id FOR UPDATE;
        IF NOT FOUND OR locked_session.status<>'open' THEN RAISE EXCEPTION 'Count lines require an open clinic count session'; END IF;
        IF locked_session.scope_transaction_id<>txid_current() THEN
          RAISE EXCEPTION 'Count session lines are fixed when the session starts';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM clinic_pharmacy_batches batch
           WHERE batch.practice_id=NEW.practice_id AND batch.id=NEW.batch_id
             AND batch.location_id=locked_session.location_id
        ) THEN RAISE EXCEPTION 'Count line position must belong to the session inventory bin'; END IF;
        SELECT COUNT(*) INTO position_count FROM clinic_inventory_count_session_lines
         WHERE practice_id=NEW.practice_id AND count_session_id=NEW.count_session_id;
        IF position_count>=500 THEN RAISE EXCEPTION 'A count session cannot contain more than 500 positions'; END IF;
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_count_session_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE locked_session clinic_inventory_count_sessions%ROWTYPE; prior_kind text;
      BEGIN
        IF NEW.kind='observed' THEN
          PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,'count');
        ELSE
          PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,'configure');
        END IF;
        SELECT * INTO locked_session FROM clinic_inventory_count_sessions
         WHERE practice_id=NEW.practice_id AND id=NEW.count_session_id FOR UPDATE;
        IF NOT FOUND OR locked_session.status<>'open' THEN RAISE EXCEPTION 'Count events require an open clinic count session'; END IF;

        IF NEW.kind='observed' THEN
          IF NEW.actor_id<>locked_session.assignee_id THEN RAISE EXCEPTION 'Only the assigned counter can observe a session line'; END IF;
          IF NOT EXISTS (
            SELECT 1 FROM clinic_inventory_count_session_lines line
            JOIN clinic_inventory_counts observation
              ON observation.practice_id=line.practice_id
             AND observation.count_session_line_id=line.id
             AND observation.batch_id=line.batch_id
           WHERE line.practice_id=NEW.practice_id AND line.count_session_id=NEW.count_session_id
             AND line.id=NEW.count_session_line_id AND observation.id=NEW.count_id
             AND observation.actor_id=NEW.actor_id
          ) THEN RAISE EXCEPTION 'Observed event must reference its session count'; END IF;
          SELECT kind INTO prior_kind FROM clinic_inventory_count_session_events
           WHERE practice_id=NEW.practice_id AND count_session_line_id=NEW.count_session_line_id
             AND kind IN ('observed','skipped','resumed') ORDER BY id DESC LIMIT 1;
          IF prior_kind='skipped' THEN RAISE EXCEPTION 'A skipped count line must be resumed before observation'; END IF;
        ELSE
          IF NEW.kind IN ('skipped','resumed') AND NOT EXISTS (
            SELECT 1 FROM clinic_inventory_count_session_lines
             WHERE practice_id=NEW.practice_id AND count_session_id=NEW.count_session_id
               AND id=NEW.count_session_line_id
          ) THEN RAISE EXCEPTION 'Count line event must belong to its session'; END IF;
          IF NEW.kind='resumed' THEN
            SELECT kind INTO prior_kind FROM clinic_inventory_count_session_events
             WHERE practice_id=NEW.practice_id AND count_session_line_id=NEW.count_session_line_id
               AND kind IN ('observed','skipped','resumed') ORDER BY id DESC LIMIT 1;
            IF prior_kind IS DISTINCT FROM 'skipped' THEN RAISE EXCEPTION 'Only a skipped count line can be resumed'; END IF;
          ELSIF NEW.kind='reassigned' THEN
            PERFORM inventory_authorize(NEW.practice_id,NEW.assignee_id,'count');
          ELSIF NEW.kind='completed' THEN
            PERFORM 1 FROM clinic_pharmacy_products product
             WHERE product.practice_id=NEW.practice_id AND product.id IN (
               SELECT batch.product_id FROM clinic_inventory_count_session_lines line
               JOIN clinic_pharmacy_batches batch ON batch.practice_id=line.practice_id AND batch.id=line.batch_id
                WHERE line.practice_id=NEW.practice_id AND line.count_session_id=NEW.count_session_id
             ) ORDER BY product.id FOR UPDATE;
            PERFORM 1 FROM clinic_pharmacy_batches batch
             WHERE batch.practice_id=NEW.practice_id AND batch.id IN (
               SELECT line.batch_id FROM clinic_inventory_count_session_lines line
                WHERE line.practice_id=NEW.practice_id AND line.count_session_id=NEW.count_session_id
             ) ORDER BY batch.id FOR UPDATE;
            IF NOT inventory_count_session_ready(NEW.count_session_id,NEW.practice_id) THEN
              RAISE EXCEPTION 'Count every session line or explicitly skip it before completion';
            END IF;
          END IF;
        END IF;
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_count_session_event_applied() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE locked_session clinic_inventory_count_sessions%ROWTYPE; latest_header_event bigint;
      BEGIN
        IF NEW.kind NOT IN ('reassigned','completed','cancelled') THEN RETURN NEW; END IF;
        SELECT MAX(id) INTO latest_header_event FROM clinic_inventory_count_session_events
         WHERE practice_id=NEW.practice_id AND count_session_id=NEW.count_session_id
           AND kind IN ('reassigned','completed','cancelled');
        IF latest_header_event<>NEW.id THEN RETURN NEW; END IF;
        SELECT * INTO locked_session FROM clinic_inventory_count_sessions
         WHERE practice_id=NEW.practice_id AND id=NEW.count_session_id;
        IF NEW.kind='reassigned' AND locked_session.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
          RAISE EXCEPTION 'Count reassignment event was not applied to the session';
        ELSIF NEW.kind IN ('completed','cancelled') AND locked_session.status IS DISTINCT FROM NEW.kind THEN
          RAISE EXCEPTION 'Count lifecycle event was not applied to the session';
        END IF;
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_session_count_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE locked_session clinic_inventory_count_sessions%ROWTYPE; prior_kind text;
      BEGIN
        IF NEW.count_session_line_id IS NULL THEN RETURN NEW; END IF;
        PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,'count',NEW.profile_id);
        SELECT session.* INTO locked_session
          FROM clinic_inventory_count_session_lines line
          JOIN clinic_inventory_count_sessions session
            ON session.practice_id=line.practice_id AND session.id=line.count_session_id
         WHERE line.practice_id=NEW.practice_id AND line.id=NEW.count_session_line_id
           AND line.batch_id=NEW.batch_id FOR UPDATE OF session;
        IF NOT FOUND OR locked_session.status<>'open' THEN RAISE EXCEPTION 'Session count requires an open matching count line'; END IF;
        IF NEW.actor_id<>locked_session.assignee_id THEN RAISE EXCEPTION 'Only the assigned counter can observe a session line'; END IF;
        SELECT kind INTO prior_kind FROM clinic_inventory_count_session_events
         WHERE practice_id=NEW.practice_id AND count_session_line_id=NEW.count_session_line_id
           AND kind IN ('observed','skipped','resumed') ORDER BY id DESC LIMIT 1;
        IF prior_kind='skipped' THEN RAISE EXCEPTION 'A skipped count line must be resumed before observation'; END IF;
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_session_count_event_required() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.count_session_line_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM clinic_inventory_count_session_events event
           WHERE event.practice_id=NEW.practice_id AND event.count_id=NEW.id
             AND event.count_session_line_id=NEW.count_session_line_id AND event.kind='observed'
        ) THEN RAISE EXCEPTION 'Session count requires matching observed event evidence'; END IF;
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_count_approval_authority() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE observation clinic_inventory_counts%ROWTYPE; session_status text; latest_count bigint; latest_kind text; latest_event_count bigint;
      BEGIN
        SELECT * INTO observation FROM clinic_inventory_counts
         WHERE practice_id=NEW.practice_id AND id=NEW.count_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Count approval must reference a clinic count'; END IF;
        IF observation.actor_id=NEW.actor_id THEN RAISE EXCEPTION 'A counter cannot approve their own count'; END IF;
        NEW.profile_id := inventory_authorize(NEW.practice_id,NEW.actor_id,'count',NEW.profile_id);
        IF observation.expected_quantity<>observation.observed_quantity THEN
          PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,'adjust',NEW.profile_id);
        END IF;
        IF observation.count_session_line_id IS NOT NULL THEN
          SELECT session.status INTO session_status
            FROM clinic_inventory_count_session_lines line
            JOIN clinic_inventory_count_sessions session
              ON session.practice_id=line.practice_id AND session.id=line.count_session_id
           WHERE line.practice_id=NEW.practice_id AND line.id=observation.count_session_line_id
             AND line.batch_id=observation.batch_id FOR UPDATE OF session;
          SELECT MAX(id) INTO latest_count FROM clinic_inventory_counts
           WHERE practice_id=NEW.practice_id AND count_session_line_id=observation.count_session_line_id;
          SELECT kind,count_id INTO latest_kind,latest_event_count
            FROM clinic_inventory_count_session_events
           WHERE practice_id=NEW.practice_id AND count_session_line_id=observation.count_session_line_id
             AND kind IN ('observed','skipped','resumed') ORDER BY id DESC LIMIT 1;
          IF latest_count IS DISTINCT FROM observation.id OR latest_kind IS DISTINCT FROM 'observed' OR latest_event_count IS DISTINCT FROM observation.id THEN
            RAISE EXCEPTION 'Count approval must reference the latest active session observation';
          END IF;
          IF session_status IS DISTINCT FROM 'open' AND NOT (
            session_status='completed' AND observation.expected_quantity=observation.observed_quantity
          ) THEN RAISE EXCEPTION 'Count session no longer accepts this approval'; END IF;
        END IF;
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_count_correction_authority() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE observation clinic_inventory_counts%ROWTYPE;
      BEGIN
        IF NEW.count_id IS NULL THEN RETURN NEW; END IF;
        SELECT * INTO observation FROM clinic_inventory_counts
         WHERE practice_id=NEW.practice_id AND id=NEW.count_id;
        IF NOT FOUND OR NEW.actor_id=observation.actor_id THEN
          RAISE EXCEPTION 'Count correction requires a separate clinic approver';
        END IF;
        PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,'count',NEW.profile_id);
        PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,'adjust',NEW.profile_id);
        RETURN NEW;
      END $$;

      CREATE FUNCTION inventory_control_certification_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE observation clinic_inventory_counts%ROWTYPE; stock numeric; cutoff bigint; schedule text; approval_entry bigint;
        session_status text; latest_count bigint; latest_kind text; latest_event_count bigint;
        member_id bigint; required_permission text;
      BEGIN
        required_permission := CASE WHEN NEW.kind='certification' THEN 'controlled.certify' ELSE 'controlled.count' END;
        PERFORM 1 FROM clinic_practices WHERE id=NEW.practice_id FOR SHARE;
        SELECT membership.id INTO member_id
          FROM clinic_memberships membership
          JOIN users reviewer ON reviewer.id=membership.user_id
         WHERE membership.practice_id=NEW.practice_id AND membership.user_id=NEW.actor_id
           AND membership.active AND reviewer.active FOR SHARE OF membership,reviewer;
        IF NOT FOUND OR NOT EXISTS (
          SELECT 1 FROM clinic_role_grants grant_record
          JOIN role_version_permissions role_permission ON role_permission.role_version_id=grant_record.role_version_id
          JOIN permissions permission ON permission.id=role_permission.permission_id
          WHERE grant_record.practice_id=NEW.practice_id AND grant_record.membership_id=member_id
            AND grant_record.scope_kind='practice' AND grant_record.effective_from<=CURRENT_TIMESTAMP
            AND (grant_record.effective_until IS NULL OR grant_record.effective_until>CURRENT_TIMESTAMP)
            AND grant_record.revoked_at IS NULL AND permission.action_code=required_permission
        ) THEN RAISE EXCEPTION 'Controlled review action not permitted'; END IF;
        SELECT * INTO observation FROM clinic_inventory_counts
         WHERE practice_id=NEW.practice_id AND id=NEW.count_id;
        IF NOT FOUND OR observation.actor_id=NEW.actor_id THEN
          RAISE EXCEPTION 'Controlled certification requires a separate clinic reviewer';
        END IF;
        IF observation.count_session_line_id IS NOT NULL THEN
          SELECT session.status INTO session_status
            FROM clinic_inventory_count_session_lines line
           JOIN clinic_inventory_count_sessions session
              ON session.practice_id=line.practice_id AND session.id=line.count_session_id
           WHERE line.practice_id=NEW.practice_id AND line.id=observation.count_session_line_id
             AND line.batch_id=observation.batch_id FOR UPDATE OF session;
        END IF;
        SELECT product.dea_schedule INTO schedule
          FROM clinic_pharmacy_batches batch
          JOIN clinic_pharmacy_products product ON product.id=batch.product_id AND product.practice_id=batch.practice_id
         WHERE batch.practice_id=NEW.practice_id AND batch.id=observation.batch_id FOR SHARE OF product;
        SELECT on_hand INTO stock FROM clinic_pharmacy_batches
         WHERE practice_id=NEW.practice_id AND id=observation.batch_id FOR UPDATE;
        IF schedule IS NULL THEN RAISE EXCEPTION 'Controlled review requires controlled inventory'; END IF;
        IF NEW.kind='investigation' THEN
          IF NOT EXISTS (
            SELECT 1 FROM clinic_inventory_count_approvals approval
             WHERE approval.practice_id=NEW.practice_id AND approval.count_id=observation.id
               AND approval.actor_id=NEW.actor_id
          ) THEN RAISE EXCEPTION 'Controlled investigation requires matching count approval evidence'; END IF;
          RETURN NEW;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM clinic_inventory_control_reviews investigation
           WHERE investigation.practice_id=NEW.practice_id AND investigation.count_id=NEW.count_id
             AND investigation.kind='investigation' AND investigation.actor_id<>NEW.actor_id
        ) THEN RAISE EXCEPTION 'Controlled certification requires a separate investigation'; END IF;
        IF observation.count_session_line_id IS NOT NULL THEN
          SELECT MAX(id) INTO latest_count FROM clinic_inventory_counts
           WHERE practice_id=NEW.practice_id AND count_session_line_id=observation.count_session_line_id;
          SELECT kind,count_id INTO latest_kind,latest_event_count
            FROM clinic_inventory_count_session_events
           WHERE practice_id=NEW.practice_id AND count_session_line_id=observation.count_session_line_id
             AND kind IN ('observed','skipped','resumed') ORDER BY id DESC LIMIT 1;
          IF session_status='cancelled' OR latest_count IS DISTINCT FROM observation.id OR
            latest_kind IS DISTINCT FROM 'observed' OR latest_event_count IS DISTINCT FROM observation.id THEN
            RAISE EXCEPTION 'Controlled certification requires the latest active session observation';
          END IF;
        END IF;
        SELECT MAX(id) INTO cutoff FROM clinic_inventory_entries
         WHERE practice_id=NEW.practice_id AND stock_type='pharmacy' AND batch_id=observation.batch_id;
        SELECT entry_id INTO approval_entry FROM clinic_inventory_count_approvals
         WHERE practice_id=NEW.practice_id AND count_id=observation.id;
        IF stock<>observation.observed_quantity OR
          (observation.expected_quantity=observation.observed_quantity AND cutoff IS DISTINCT FROM observation.cutoff_entry_id) OR
          (observation.expected_quantity<>observation.observed_quantity AND (approval_entry IS NULL OR cutoff<>approval_entry)) THEN
          RAISE EXCEPTION 'Controlled certification requires a current reconciled count';
        END IF;
        RETURN NEW;
      END $$;

      CREATE TRIGGER inventory_count_session_guard
      BEFORE INSERT OR UPDATE ON clinic_inventory_count_sessions
      FOR EACH ROW EXECUTE FUNCTION inventory_count_session_guard();
      CREATE TRIGGER inventory_count_session_delete_guard
      BEFORE DELETE ON clinic_inventory_count_sessions
      FOR EACH ROW EXECUTE FUNCTION inventory_count_session_delete_guard();
      CREATE CONSTRAINT TRIGGER inventory_count_session_scope_complete
      AFTER INSERT ON clinic_inventory_count_sessions DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION inventory_count_session_scope_complete();

      CREATE TRIGGER inventory_count_session_line_guard
      BEFORE INSERT ON clinic_inventory_count_session_lines
      FOR EACH ROW EXECUTE FUNCTION inventory_count_session_line_guard();
      CREATE TRIGGER inventory_count_session_line_immutable
      BEFORE UPDATE OR DELETE ON clinic_inventory_count_session_lines
      FOR EACH ROW EXECUTE FUNCTION inventory_immutable();

      CREATE TRIGGER inventory_count_session_event_guard
      BEFORE INSERT ON clinic_inventory_count_session_events
      FOR EACH ROW EXECUTE FUNCTION inventory_count_session_event_guard();
      CREATE TRIGGER inventory_count_session_event_immutable
      BEFORE UPDATE OR DELETE ON clinic_inventory_count_session_events
      FOR EACH ROW EXECUTE FUNCTION inventory_immutable();
      CREATE CONSTRAINT TRIGGER inventory_count_session_event_applied
      AFTER INSERT ON clinic_inventory_count_session_events DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION inventory_count_session_event_applied();

      CREATE TRIGGER count_session_scope
      BEFORE INSERT ON clinic_inventory_counts
      FOR EACH ROW EXECUTE FUNCTION inventory_session_count_guard();
      CREATE CONSTRAINT TRIGGER count_session_event_required
      AFTER INSERT ON clinic_inventory_counts DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION inventory_session_count_event_required();
      CREATE TRIGGER count_approval_separation
      BEFORE INSERT ON clinic_inventory_count_approvals
      FOR EACH ROW EXECUTE FUNCTION inventory_count_approval_authority();
      CREATE TRIGGER count_correction_authority
      BEFORE INSERT ON clinic_inventory_entries
      FOR EACH ROW EXECUTE FUNCTION inventory_count_correction_authority();
      CREATE TRIGGER controlled_count_certification_guard
      BEFORE INSERT ON clinic_inventory_control_reviews
      FOR EACH ROW EXECUTE FUNCTION inventory_control_certification_guard();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration,
      "Preserve inventory count-session evidence; restore a reviewed backup instead."
  end
end
