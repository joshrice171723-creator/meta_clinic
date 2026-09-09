SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: clinic_enforce_invoice_status_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clinic_enforce_invoice_status_transition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status = NEW.status
    OR (OLD.status = 'draft' AND NEW.status = 'posted')
    OR (OLD.status = 'posted' AND NEW.status = 'void') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid clinic invoice status transition from % to %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;


--
-- Name: clinic_invoice_line_editable_draft(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clinic_invoice_line_editable_draft() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    old_status text;
    new_status text;
  BEGIN
    SELECT status INTO old_status FROM clinic_invoices WHERE id = OLD.invoice_id;
    IF old_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'This record is append-only';
    END IF;

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


--
-- Name: clinic_lab_report_versions_protect(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clinic_lab_report_versions_protect() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Lab report versions are append-only';
  END IF;
  IF OLD.practice_id IS DISTINCT FROM NEW.practice_id
    OR OLD.patient_id IS DISTINCT FROM NEW.patient_id
    OR OLD.lab_report_id IS DISTINCT FROM NEW.lab_report_id
    OR OLD.version_number IS DISTINCT FROM NEW.version_number
    OR OLD.title IS DISTINCT FROM NEW.title
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.collected_at IS DISTINCT FROM NEW.collected_at
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
    OR OLD.results_payload IS DISTINCT FROM NEW.results_payload
    OR OLD.entry_kind IS DISTINCT FROM NEW.entry_kind
    OR OLD.content_digest IS DISTINCT FROM NEW.content_digest
    OR OLD.recorded_by_membership_id IS DISTINCT FROM NEW.recorded_by_membership_id
    OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at THEN
    RAISE EXCEPTION 'Lab report version payloads are immutable';
  END IF;
  IF OLD.reviewed_at IS NOT NULL AND (
    OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
    OR OLD.reviewed_by_membership_id IS DISTINCT FROM NEW.reviewed_by_membership_id
  ) THEN
    RAISE EXCEPTION 'Lab report review evidence is write-once';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: clinic_lab_result_follow_ups_protect(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clinic_lab_result_follow_ups_protect() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Lab result follow-ups cannot be deleted';
  END IF;

  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.practice_id IS DISTINCT FROM NEW.practice_id
    OR OLD.patient_id IS DISTINCT FROM NEW.patient_id
    OR OLD.lab_report_id IS DISTINCT FROM NEW.lab_report_id
    OR OLD.lab_report_version_id IS DISTINCT FROM NEW.lab_report_version_id
    OR OLD.instructions IS DISTINCT FROM NEW.instructions
    OR OLD.recorded_by_membership_id IS DISTINCT FROM NEW.recorded_by_membership_id
    OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.state <> 'open'
    OR NEW.state NOT IN ('completed', 'superseded') THEN
    RAISE EXCEPTION 'Lab result follow-up evidence is immutable';
  END IF;

  IF NEW.state = 'completed' AND (
    NEW.outcome IS NULL
    OR NEW.completed_at IS NULL
    OR NEW.completed_by_membership_id IS NULL
    OR NEW.superseded_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Completed lab result follow-up evidence is incomplete';
  END IF;

  IF NEW.state = 'superseded' AND (
    NEW.outcome IS NOT NULL
    OR NEW.completed_at IS NOT NULL
    OR NEW.completed_by_membership_id IS NOT NULL
    OR NEW.superseded_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Superseded lab result follow-up evidence is incomplete';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: clinic_model_versions_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clinic_model_versions_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Model-change versions are append-only';
END;
$$;


--
-- Name: clinic_operation_receipts_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clinic_operation_receipts_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'clinic operation receipts are append-only';
END;
$$;


--
-- Name: clinic_previsit_notes_protect(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clinic_previsit_notes_protect() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Pre-visit note history is immutable';
END;
$$;


--
-- Name: clinic_telehealth_wrap_ups_protect_finalized(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clinic_telehealth_wrap_ups_protect_finalized() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status = 'finalized' THEN
    RAISE EXCEPTION 'Finalized telehealth wrap-ups are immutable';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: erd_freeze_granted_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.erd_freeze_granted_role() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Both grant creation and permission insertion serialize on the role.
  PERFORM 1 FROM role_versions WHERE id = NEW.role_version_id FOR UPDATE;
  IF TG_TABLE_NAME = 'role_version_permissions' AND EXISTS (
    SELECT 1 FROM clinic_role_grants WHERE role_version_id = NEW.role_version_id
  ) THEN
    RAISE EXCEPTION 'Create a new role version instead of changing a granted permission set';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: erd_immutable_record(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.erd_immutable_record() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'This record is append-only';
END;
$$;


--
-- Name: erd_preserve_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.erd_preserve_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE field text;
BEGIN
  FOREACH field IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(OLD) -> field) IS DISTINCT FROM (to_jsonb(NEW) -> field) THEN
      RAISE EXCEPTION 'Record ownership and historical identity cannot be reassigned';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;


--
-- Name: guard_invoice_stripe_checkout_routing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_invoice_stripe_checkout_routing() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Invoice Stripe checkout history cannot be deleted'; END IF;
  IF (to_jsonb(OLD) - ARRAY['updated_at','session_id','session_status']) <>
     (to_jsonb(NEW) - ARRAY['updated_at','session_id','session_status']) OR
     (OLD.session_id IS NOT NULL AND OLD.session_id IS DISTINCT FROM NEW.session_id) THEN
    RAISE EXCEPTION 'Invoice Stripe checkout routing cannot be changed';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: guard_stripe_routing(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_stripe_routing() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Stripe routing history cannot be deleted'; END IF;
  IF TG_TABLE_NAME = 'clinic_stripe_connections' THEN
    IF OLD.practice_id <> NEW.practice_id OR OLD.reference <> NEW.reference OR
      (OLD.account_id IS NOT NULL AND OLD.account_id IS DISTINCT FROM NEW.account_id) THEN
      RAISE EXCEPTION 'Stripe clinic routing cannot be changed';
    END IF;
  ELSE
    IF (to_jsonb(OLD) - ARRAY['updated_at','session_id','subscription_id','subscription_status','cancel_at_period_end','last_synced_at','session_status','renewal_amount_due','renewal_invoice_status']) <>
       (to_jsonb(NEW) - ARRAY['updated_at','session_id','subscription_id','subscription_status','cancel_at_period_end','last_synced_at','session_status','renewal_amount_due','renewal_invoice_status']) OR
       (OLD.session_id IS NOT NULL AND OLD.session_id IS DISTINCT FROM NEW.session_id) OR
       (OLD.subscription_id IS NOT NULL AND OLD.subscription_id IS DISTINCT FROM NEW.subscription_id) THEN
      RAISE EXCEPTION 'Stripe checkout terms cannot be changed';
    END IF;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: inventory_authorize(bigint, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_authorize(clinic bigint, actor bigint, action text, profile bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE member_id bigint; configuration clinic_inventory_profiles%ROWTYPE; required_permission text;
BEGIN
  PERFORM 1 FROM clinic_practices WHERE id = clinic FOR SHARE;
  SELECT m.id INTO member_id FROM clinic_memberships m JOIN users u ON u.id = m.user_id WHERE m.practice_id = clinic AND m.user_id = actor AND m.active AND u.active FOR SHARE OF m;
  IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE = 'Actor has no active clinic membership'; END IF;
  required_permission := CASE WHEN action IN ('recall.lock', 'recall.dispose') THEN action ELSE 'inventory.' || action END;
  IF NOT EXISTS (
    SELECT 1 FROM clinic_role_grants g
    JOIN role_version_permissions rvp ON rvp.role_version_id = g.role_version_id
    JOIN permissions p ON p.id = rvp.permission_id
    WHERE g.practice_id = clinic AND g.membership_id = member_id AND g.scope_kind = 'practice'
      AND g.effective_from <= CURRENT_TIMESTAMP AND (g.effective_until IS NULL OR g.effective_until > CURRENT_TIMESTAMP)
      AND g.revoked_at IS NULL AND p.action_code = required_permission
  ) THEN
    RAISE EXCEPTION 'Inventory action not permitted';
  END IF;
  SELECT * INTO configuration FROM clinic_inventory_profiles WHERE practice_id = clinic ORDER BY version DESC LIMIT 1;
  IF action <> 'configure' AND (configuration.id IS NULL OR configuration.status NOT IN ('configured','synthetic') OR NOT ('inventory' = ANY(configuration.capabilities)) OR (profile IS NOT NULL AND profile <> configuration.id)) THEN
    RAISE EXCEPTION 'Inventory profile is unavailable or stale';
  END IF;
  RETURN configuration.id;
END; $$;


--
-- Name: inventory_balance_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_balance_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_TABLE_NAME='clinic_pharmacy_batches' THEN
    IF (NEW.practice_id,NEW.product_id,NEW.lot_id,NEW.location_id,NEW.lot_number,NEW.location,NEW.expires_on,NEW.supplier,NEW.status) IS DISTINCT FROM (OLD.practice_id,OLD.product_id,OLD.lot_id,OLD.location_id,OLD.lot_number,OLD.location,OLD.expires_on,OLD.supplier,OLD.status) THEN RAISE EXCEPTION 'Stock identity and legacy status are immutable'; END IF;
    IF NEW.on_hand<>OLD.on_hand AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Post a stock movement to change balance'; END IF;
  ELSE
    IF NEW.practice_id<>OLD.practice_id THEN RAISE EXCEPTION 'Stock clinic is immutable'; END IF;
    IF NEW.quantity<>OLD.quantity AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Post a stock movement to change balance'; END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_catalog_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_catalog_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE actor bigint; fields varchar[];
BEGIN
  IF (NEW.practice_id,NEW.stock_unit,NEW.quantity_scale,NEW.package_size,NEW.unit_reference) IS DISTINCT FROM (OLD.practice_id,OLD.stock_unit,OLD.quantity_scale,OLD.package_size,OLD.unit_reference) THEN RAISE EXCEPTION 'Create a verified package variant instead of changing historical units'; END IF;
  SELECT array_agg(n.key ORDER BY n.key) INTO fields FROM jsonb_each(to_jsonb(NEW)) n WHERE n.key<>'updated_at' AND n.value IS DISTINCT FROM to_jsonb(OLD)->n.key;
  IF fields IS NOT NULL THEN
    actor := NULLIF(current_setting('apply.inventory_actor',true),'')::bigint;
    IF actor IS NULL THEN RAISE EXCEPTION 'Catalog changes require actor attribution'; END IF;
    INSERT INTO clinic_inventory_catalog_events (practice_id,product_id,actor_id,changed_fields,created_at,updated_at) VALUES (NEW.practice_id,NEW.id,actor,fields,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_control_certification_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_control_certification_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_count_approval_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_approval_authority() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_count_correction_authority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_correction_authority() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_count_session_delete_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_session_delete_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Count sessions are retained as inventory evidence';
END $$;


--
-- Name: inventory_count_session_event_applied(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_session_event_applied() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_count_session_event_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_session_event_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_count_session_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_session_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_count_session_line_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_session_line_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_count_session_ready(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_session_ready(session bigint, clinic bigint) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
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


--
-- Name: inventory_count_session_scope_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_count_session_scope_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_entry_post(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_entry_post() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE unit text; scale integer; line clinic_inventory_receipt_lines%ROWTYPE;
BEGIN
  IF NEW.origin <> 'posted' THEN RAISE EXCEPTION 'Legacy provenance is migration-only'; END IF;
  IF NEW.stock_type='pharmacy' THEN
    SELECT p.stock_unit,p.quantity_scale INTO unit,scale FROM clinic_pharmacy_batches b JOIN clinic_pharmacy_products p ON p.id=b.product_id WHERE b.id=NEW.batch_id AND b.practice_id=NEW.practice_id;
    IF FOUND AND (NEW.stock_unit<>unit OR NEW.quantity<>round(NEW.quantity,scale)) THEN RAISE EXCEPTION 'Incompatible stock unit or precision'; END IF;
    IF NEW.kind='receipt' THEN
      SELECT * INTO line FROM clinic_inventory_receipt_lines WHERE id=NEW.receipt_line_id AND practice_id=NEW.practice_id;
      IF NOT FOUND OR line.batch_id<>NEW.batch_id OR line.quantity<>NEW.quantity OR line.stock_unit<>NEW.stock_unit THEN RAISE EXCEPTION 'Receipt movement requires a matching receipt line'; END IF;
    ELSIF NEW.receipt_line_id IS NOT NULL THEN RAISE EXCEPTION 'Only receipts reference receipt lines'; END IF;
    UPDATE clinic_pharmacy_batches SET on_hand=on_hand+NEW.quantity WHERE id=NEW.batch_id AND practice_id=NEW.practice_id;
  ELSE
    IF NEW.stock_unit<>'each' OR NEW.quantity<>round(NEW.quantity,0) THEN RAISE EXCEPTION 'Office stock uses whole each units'; END IF;
    UPDATE clinic_items SET quantity=quantity+NEW.quantity WHERE id=NEW.item_id AND practice_id=NEW.practice_id;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_evidence_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_evidence_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_TABLE_NAME='clinic_inventory_receipts' THEN
    IF NOT EXISTS (SELECT 1 FROM clinic_inventory_receipt_lines WHERE receipt_id=NEW.id) THEN RAISE EXCEPTION 'Receipt has no lines'; END IF;
  ELSIF TG_TABLE_NAME='clinic_inventory_receipt_lines' THEN
    IF NOT EXISTS (SELECT 1 FROM clinic_inventory_entries WHERE receipt_line_id=NEW.id AND kind='receipt') THEN RAISE EXCEPTION 'Receipt line has no posting'; END IF;
  ELSE
    IF NEW.count_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clinic_inventory_count_approvals WHERE count_id=NEW.count_id AND entry_id=NEW.id AND actor_id=NEW.actor_id) THEN RAISE EXCEPTION 'Count posting has no matching approval'; END IF;
  END IF;
  RETURN NULL;
END $$;


--
-- Name: inventory_evidence_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_evidence_context() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE action text; stock numeric; cutoff bigint; scale integer; observation clinic_inventory_counts%ROWTYPE; previous integer;
BEGIN
  action := CASE TG_TABLE_NAME WHEN 'clinic_inventory_count_approvals' THEN 'count' WHEN 'clinic_inventory_receipts' THEN 'receive' WHEN 'clinic_inventory_hold_releases' THEN 'release' WHEN 'clinic_inventory_counts' THEN 'count' WHEN 'clinic_inventory_profiles' THEN 'configure' ELSE 'catalog' END;
  IF TG_TABLE_NAME='clinic_inventory_holds' THEN
    action := CASE WHEN NEW.recall_id IS NOT NULL THEN 'recall.lock' WHEN NEW.transfer_id IS NOT NULL THEN 'transfer' ELSE 'hold' END;
  END IF;
  IF TG_TABLE_NAME='clinic_inventory_profiles' THEN
    PERFORM 1 FROM clinic_practices WHERE id=NEW.practice_id FOR UPDATE;
    SELECT COALESCE(MAX(version),0) INTO previous FROM clinic_inventory_profiles WHERE practice_id=NEW.practice_id;
    IF NEW.version<>previous+1 THEN RAISE EXCEPTION 'Profile version must follow current version'; END IF;
    IF previous=0 AND NEW.actor_id IS NULL AND NEW.status='synthetic' THEN RETURN NEW; END IF;
    PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,action);
  ELSE
    NEW.profile_id := inventory_authorize(NEW.practice_id,NEW.actor_id,action,NEW.profile_id);
  END IF;
  IF TG_TABLE_NAME='clinic_inventory_counts' THEN
    SELECT b.on_hand,p.quantity_scale INTO stock,scale FROM clinic_pharmacy_batches b JOIN clinic_pharmacy_products p ON p.id=b.product_id WHERE b.id=NEW.batch_id FOR UPDATE OF b;
    SELECT MAX(id) INTO cutoff FROM clinic_inventory_entries WHERE batch_id=NEW.batch_id;
    IF NEW.expected_quantity<>stock OR NEW.cutoff_entry_id IS DISTINCT FROM cutoff OR NEW.observed_quantity<>round(NEW.observed_quantity,scale) THEN RAISE EXCEPTION 'Count snapshot does not match stock'; END IF;
  ELSIF TG_TABLE_NAME='clinic_inventory_count_approvals' THEN
    SELECT * INTO observation FROM clinic_inventory_counts WHERE id=NEW.count_id;
    SELECT on_hand INTO stock FROM clinic_pharmacy_batches WHERE id=observation.batch_id FOR UPDATE;
    SELECT MAX(id) INTO cutoff FROM clinic_inventory_entries WHERE batch_id=observation.batch_id;
    IF NEW.entry_id IS NULL THEN
      IF observation.expected_quantity<>observation.observed_quantity OR stock<>observation.observed_quantity OR cutoff IS DISTINCT FROM observation.cutoff_entry_id THEN RAISE EXCEPTION 'Count approval needs an exact variance posting'; END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM clinic_inventory_entries WHERE id=NEW.entry_id AND count_id=NEW.count_id AND actor_id=NEW.actor_id AND profile_id=NEW.profile_id) THEN RAISE EXCEPTION 'Count approval posting does not match'; END IF;
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: inventory_evidence_link_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_evidence_link_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
      IF NOT FOUND OR NEW.practice_id <> recall.practice_id OR NEW.kind <> 'recalled' OR NOT EXISTS (
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


--
-- Name: inventory_exception_review_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_exception_review_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Inventory history is append-only'; END $$;


--
-- Name: inventory_location_delete_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_location_delete_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'Inventory locations must be retired, not deleted';
END; $$;


--
-- Name: inventory_location_hierarchy_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_location_hierarchy_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  parent clinic_inventory_locations%ROWTYPE;
  site_status text;
  cycle_found boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory-location:' || NEW.practice_id::text, 0));

  IF NEW.site_id IS NOT NULL THEN
    SELECT status INTO site_status
      FROM clinic_sites
     WHERE practice_id = NEW.practice_id AND id = NEW.site_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory location facility must belong to the clinic';
    END IF;
    IF NEW.status = 'active' AND site_status <> 'active' THEN
      RAISE EXCEPTION 'An active inventory location requires an active facility';
    END IF;
  END IF;

  IF NEW.parent_location_id IS NOT NULL THEN
    SELECT * INTO parent
      FROM clinic_inventory_locations
     WHERE practice_id = NEW.practice_id AND id = NEW.parent_location_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory parent location must belong to the clinic';
    END IF;
    IF parent.status <> 'active' THEN
      RAISE EXCEPTION 'Inventory parent location must be active';
    END IF;
    IF NEW.site_id IS DISTINCT FROM parent.site_id THEN
      RAISE EXCEPTION 'Inventory child and parent locations must use the same facility';
    END IF;
    IF parent.kind IN ('quarantine','returns','controlled') AND NEW.kind IS DISTINCT FROM parent.kind THEN
      RAISE EXCEPTION 'Inventory child location must preserve its restricted parent kind';
    END IF;
    IF EXISTS (SELECT 1 FROM clinic_pharmacy_batches WHERE practice_id = NEW.practice_id AND location_id = parent.id) THEN
      RAISE EXCEPTION 'A location with inventory history cannot become a parent location';
    END IF;

    WITH RECURSIVE ancestors(id, parent_location_id) AS (
      SELECT id, parent_location_id
        FROM clinic_inventory_locations
       WHERE practice_id = NEW.practice_id AND id = NEW.parent_location_id
      UNION
      SELECT location.id, location.parent_location_id
        FROM clinic_inventory_locations location
        JOIN ancestors ON location.id = ancestors.parent_location_id
       WHERE location.practice_id = NEW.practice_id
    )
    SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_found;
    IF cycle_found THEN
      RAISE EXCEPTION 'Inventory location hierarchy cannot contain a cycle';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (
      NEW.name IS DISTINCT FROM OLD.name OR
      NEW.kind IS DISTINCT FROM OLD.kind OR
      NEW.site_id IS DISTINCT FROM OLD.site_id OR
      NEW.parent_location_id IS DISTINCT FROM OLD.parent_location_id
    ) AND EXISTS (SELECT 1 FROM clinic_pharmacy_batches WHERE practice_id = NEW.practice_id AND location_id = NEW.id) THEN
      RAISE EXCEPTION 'A location with inventory history cannot change hierarchy identity';
    END IF;

    IF (
      NEW.name IS DISTINCT FROM OLD.name OR
      NEW.kind IS DISTINCT FROM OLD.kind OR
      NEW.site_id IS DISTINCT FROM OLD.site_id OR
      NEW.parent_location_id IS DISTINCT FROM OLD.parent_location_id
    ) AND EXISTS (SELECT 1 FROM clinic_inventory_locations WHERE practice_id = NEW.practice_id AND parent_location_id = NEW.id) THEN
      RAISE EXCEPTION 'A parent location cannot change hierarchy identity';
    END IF;

    IF NEW.status = 'retired' AND OLD.status IS DISTINCT FROM NEW.status THEN
      IF EXISTS (SELECT 1 FROM clinic_pharmacy_batches WHERE practice_id = NEW.practice_id AND location_id = NEW.id AND on_hand > 0) THEN
        RAISE EXCEPTION 'A location with on-hand inventory cannot be retired';
      END IF;
      IF EXISTS (SELECT 1 FROM clinic_inventory_locations WHERE practice_id = NEW.practice_id AND parent_location_id = NEW.id AND status = 'active') THEN
        RAISE EXCEPTION 'A location with active children cannot be retired';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END; $$;


--
-- Name: inventory_location_stock_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_location_stock_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  validate_destination boolean;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('inventory-location:' || NEW.practice_id::text, 0));

  IF TG_OP = 'INSERT' THEN
    validate_destination := NEW.on_hand > 0;
  ELSE
    validate_destination := NEW.on_hand > 0 AND (
      NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.on_hand > OLD.on_hand
    );
  END IF;

  IF validate_destination AND NOT EXISTS (
    SELECT 1
      FROM clinic_inventory_locations location
     WHERE location.practice_id = NEW.practice_id
       AND location.id = NEW.location_id
       AND location.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM clinic_inventory_locations child
          WHERE child.practice_id = location.practice_id
            AND child.parent_location_id = location.id
       )
       AND (
         location.site_id IS NULL OR EXISTS (
           SELECT 1 FROM clinic_sites site
            WHERE site.practice_id = location.practice_id
              AND site.id = location.site_id
              AND site.status = 'active'
         )
       )
  ) THEN
    RAISE EXCEPTION 'On-hand inventory requires an active leaf location at an active facility';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: inventory_new_position(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_new_position() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_TABLE_NAME='clinic_items' THEN
    IF NEW.quantity<>0 THEN RAISE EXCEPTION 'New stock starts at zero; post opening stock'; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM clinic_inventory_lots l JOIN clinic_inventory_locations s ON s.id=NEW.location_id AND s.practice_id=NEW.practice_id WHERE l.id=NEW.lot_id AND l.practice_id=NEW.practice_id AND l.product_id=NEW.product_id AND l.number=NEW.lot_number AND l.expires_on=NEW.expires_on AND s.name=NEW.location) THEN
      RAISE foreign_key_violation USING MESSAGE='Stock position must match its clinic, lot and location';
    END IF;
    IF NEW.on_hand<>0 OR NEW.status<>'active' THEN RAISE EXCEPTION 'New positions start empty without holds'; END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_posting_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_posting_context() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE receipt clinic_inventory_receipts%ROWTYPE; observation clinic_inventory_counts%ROWTYPE; balance numeric; cutoff bigint; active_product boolean;
BEGIN
  PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,CASE WHEN NEW.kind='receipt' THEN 'receive' WHEN NEW.transfer_id IS NOT NULL THEN 'transfer' WHEN NEW.recall_disposition_id IS NOT NULL THEN 'recall.dispose' WHEN NEW.count_id IS NOT NULL THEN 'count' ELSE 'adjust' END,NEW.profile_id);
  IF NEW.stock_type='office' AND NEW.kind<>'office_adjustment' OR NEW.stock_type='pharmacy' AND NEW.kind NOT IN ('receipt','adjustment_in','adjustment_out','damaged','expired','return_to_supplier','count_correction') THEN RAISE EXCEPTION 'Unsupported stock action'; END IF;
  IF NEW.stock_type='pharmacy' THEN
    SELECT p.active INTO active_product FROM clinic_pharmacy_products p JOIN clinic_pharmacy_batches b ON b.product_id=p.id WHERE b.id=NEW.batch_id FOR SHARE OF p;
    IF NEW.quantity>0 AND NOT active_product THEN RAISE EXCEPTION 'Inactive product cannot receive stock'; END IF;
  END IF;
  IF NEW.kind='receipt' THEN
    SELECT r.* INTO receipt FROM clinic_inventory_receipts r JOIN clinic_inventory_receipt_lines l ON l.receipt_id=r.id WHERE l.id=NEW.receipt_line_id;
    IF receipt.id IS NULL OR (receipt.practice_id,receipt.actor_id,receipt.profile_id,receipt.received_at) IS DISTINCT FROM (NEW.practice_id,NEW.actor_id,NEW.profile_id,NEW.occurred_at) THEN RAISE EXCEPTION 'Receipt attribution does not match'; END IF;
  END IF;
  IF NEW.kind='count_correction' THEN
    SELECT * INTO observation FROM clinic_inventory_counts WHERE id=NEW.count_id AND practice_id=NEW.practice_id;
    SELECT on_hand INTO balance FROM clinic_pharmacy_batches WHERE id=NEW.batch_id FOR UPDATE;
    SELECT MAX(id) INTO cutoff FROM clinic_inventory_entries WHERE batch_id=NEW.batch_id;
    IF observation.id IS NULL OR observation.batch_id<>NEW.batch_id OR observation.expected_quantity<>balance OR observation.cutoff_entry_id IS DISTINCT FROM cutoff OR NEW.quantity<>observation.observed_quantity-observation.expected_quantity THEN RAISE EXCEPTION 'Count is stale or variance does not match'; END IF;
    END IF;
  RETURN NEW;
END; $$;


--
-- Name: inventory_recall_closure_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_recall_closure_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_recall_containment_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_recall_containment_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_recall_hold_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_recall_hold_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_recall_lot_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_recall_lot_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_recall_release_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_recall_release_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clinic_inventory_holds hold
     WHERE hold.practice_id = NEW.practice_id AND hold.id = NEW.hold_id AND hold.recall_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Recall holds cannot be released directly';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_recall_status_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_recall_status_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: inventory_receipt_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_receipt_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  product clinic_pharmacy_products%ROWTYPE;
  receipt clinic_inventory_receipts%ROWTYPE;
  order_line clinic_inventory_purchase_order_lines%ROWTYPE;
  package_factor numeric;
BEGIN
  SELECT p.* INTO product FROM clinic_pharmacy_products p
    JOIN clinic_pharmacy_batches b ON b.product_id=p.id AND b.practice_id=p.practice_id
    WHERE b.id=NEW.batch_id AND b.practice_id=NEW.practice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt product must belong to its practice'; END IF;
  SELECT * INTO receipt FROM clinic_inventory_receipts WHERE id=NEW.receipt_id AND practice_id=NEW.practice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt line must belong to its receipt practice'; END IF;
  package_factor := product.package_size;
  IF NEW.purchase_order_line_id IS NOT NULL OR receipt.purchase_order_id IS NOT NULL THEN
    SELECT * INTO order_line FROM clinic_inventory_purchase_order_lines
      WHERE id=NEW.purchase_order_line_id AND practice_id=NEW.practice_id
        AND purchase_order_id=receipt.purchase_order_id AND product_id=product.id;
    IF NOT FOUND OR order_line.stock_unit IS DISTINCT FROM product.stock_unit
      OR order_line.input_unit IS DISTINCT FROM 'package' OR NEW.input_unit IS DISTINCT FROM 'package'
    THEN RAISE EXCEPTION 'Receipt units and product must match the purchase-order line'; END IF;
    package_factor := order_line.conversion_factor;
  END IF;
  IF NEW.stock_unit<>product.stock_unit OR NEW.quantity<>round(NEW.quantity,product.quantity_scale)
    OR NOT ((NEW.input_unit='package' AND NEW.conversion_factor=package_factor AND NEW.input_quantity=round(NEW.input_quantity,0))
      OR (NEW.input_unit<>'package' AND NEW.input_unit=product.stock_unit AND NEW.conversion_factor=1 AND NEW.input_quantity=round(NEW.input_quantity,product.quantity_scale)))
  THEN RAISE EXCEPTION 'Receipt conversion does not match verified product or purchase-order units'; END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_receipt_open_shipment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_receipt_open_shipment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.shipment_id IS NOT NULL THEN
    PERFORM 1 FROM clinic_inventory_shipments WHERE id=NEW.shipment_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM clinic_inventory_shipment_reconciliations WHERE shipment_id=NEW.shipment_id)
    THEN RAISE EXCEPTION 'Shipment already reconciled'; END IF;
  END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_reconciliation_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_reconciliation_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.receipt_id IS NOT NULL AND NEW.accepted_packages IS DISTINCT FROM
    (SELECT sum(input_quantity) FROM clinic_inventory_receipt_lines WHERE receipt_id=NEW.receipt_id AND practice_id=NEW.practice_id AND input_unit='package')
  THEN RAISE EXCEPTION 'Reconciliation accepted packages must match receipt postings'; END IF;
  IF EXISTS (SELECT 1 FROM clinic_inventory_receipt_lines line WHERE line.receipt_id=NEW.receipt_id AND NOT EXISTS
    (SELECT 1 FROM clinic_inventory_shipment_lines allocation WHERE allocation.shipment_id=NEW.shipment_id
      AND allocation.practice_id=NEW.practice_id AND allocation.purchase_order_line_id=line.purchase_order_line_id))
  THEN RAISE EXCEPTION 'Reconciliation receipt lines must match shipment allocation'; END IF;
  RETURN NULL;
END $$;


--
-- Name: inventory_reconciliation_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_reconciliation_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE delivery clinic_inventory_shipments%ROWTYPE;
BEGIN
  NEW.profile_id := inventory_authorize(NEW.practice_id,NEW.actor_id,'receive',NEW.profile_id);
  SELECT * INTO delivery FROM clinic_inventory_shipments WHERE id=NEW.shipment_id AND practice_id=NEW.practice_id FOR UPDATE;
  IF NOT FOUND OR delivery.status<>'delivered' OR NEW.accepted_packages+NEW.missing_packages+NEW.rejected_packages<>delivery.package_count
  THEN RAISE EXCEPTION 'Reconciliation must balance the delivered shipment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clinic_inventory_shipment_lines allocation
    JOIN clinic_inventory_purchase_order_lines line ON line.id=allocation.purchase_order_line_id AND line.practice_id=allocation.practice_id
    WHERE allocation.shipment_id=delivery.id AND allocation.practice_id=delivery.practice_id
      AND line.purchase_order_id=delivery.purchase_order_id AND allocation.expected_packages=delivery.package_count
      AND allocation.expected_packages*line.conversion_factor=delivery.expected_units)
  THEN RAISE EXCEPTION 'Reconciliation requires verified shipment allocation'; END IF;
  IF NEW.receipt_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM clinic_inventory_receipts WHERE shipment_id=delivery.id)
    THEN RAISE EXCEPTION 'Shipment already has a receipt'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM clinic_inventory_receipts WHERE id=NEW.receipt_id AND practice_id=NEW.practice_id AND shipment_id=delivery.id AND purchase_order_id=delivery.purchase_order_id AND actor_id=NEW.actor_id)
  THEN RAISE EXCEPTION 'Reconciliation must match its receipt'; END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_session_count_event_required(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_session_count_event_required() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.count_session_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clinic_inventory_count_session_events event
     WHERE event.practice_id=NEW.practice_id AND event.count_id=NEW.id
       AND event.count_session_line_id=NEW.count_session_line_id AND event.kind='observed'
  ) THEN RAISE EXCEPTION 'Session count requires matching observed event evidence'; END IF;
  RETURN NEW;
END $$;


--
-- Name: inventory_session_count_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_session_count_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: legacy_pharmacy_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.legacy_pharmacy_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Pharmacy history is append-only';
  END IF;
  PERFORM id FROM clinic_pharmacy_batches WHERE id = NEW.batch_id FOR UPDATE;
  IF (SELECT COALESCE(SUM(quantity), 0) FROM clinic_pharmacy_movements WHERE batch_id = NEW.batch_id) + NEW.quantity NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Pharmacy stock out of range';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: telehealth_join_grant_freeze(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.telehealth_join_grant_freeze() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' OR
     (to_jsonb(OLD) - 'revoked_at' - 'revocation_reason') <> (to_jsonb(NEW) - 'revoked_at' - 'revocation_reason') OR
     (OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at) THEN
    RAISE EXCEPTION 'telehealth join grants are immutable except for first revocation';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: telehealth_policy_freeze(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.telehealth_policy_freeze() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'retired' OR
     (OLD.status = 'published' AND NOT (
       NEW.status = 'retired' AND NEW.retired_at IS NOT NULL AND
       (to_jsonb(OLD) - 'status' - 'retired_at' - 'updated_at' - 'lock_version') =
         (to_jsonb(NEW) - 'status' - 'retired_at' - 'updated_at' - 'lock_version')
     )) THEN
    RAISE EXCEPTION 'published telehealth policy versions are immutable';
  END IF;
  RETURN NEW;
END; $$;


--
-- Name: workforce_adjustment_freeze(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_adjustment_freeze() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status IN ('approved','denied') THEN
    RAISE EXCEPTION 'decided workforce adjustments are immutable';
  END IF;
  RETURN NEW;
END
$$;


--
-- Name: workforce_payroll_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_payroll_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Workforce payroll history is immutable'; END; $$;


--
-- Name: workforce_timecard_freeze(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_timecard_freeze() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.status IN ('approved','superseded') THEN
    RAISE EXCEPTION 'approved workforce timecards are immutable';
  END IF;
  RETURN NEW;
END
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ar_internal_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_internal_metadata (
    key character varying NOT NULL,
    value character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_allergies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_allergies (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    data_status character varying DEFAULT 'incomplete'::character varying NOT NULL,
    recorded_by_membership_id bigint,
    reviewed_by_membership_id bigint,
    recorded_at timestamp(6) with time zone,
    last_reviewed_at timestamp(6) with time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    allergen_name text,
    reaction text,
    category character varying DEFAULT 'unknown'::character varying NOT NULL,
    clinical_status character varying DEFAULT 'unknown'::character varying NOT NULL,
    verification_status character varying DEFAULT 'unconfirmed'::character varying NOT NULL,
    criticality character varying DEFAULT 'unable_to_assess'::character varying NOT NULL,
    severity character varying DEFAULT 'unknown'::character varying NOT NULL,
    onset_at timestamp(6) with time zone,
    CONSTRAINT clinic_allergies_category CHECK (((category)::text = ANY ((ARRAY['food'::character varying, 'medication'::character varying, 'environment'::character varying, 'biologic'::character varying, 'other'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT clinic_allergies_clinical_status CHECK (((clinical_status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'resolved'::character varying, 'unknown'::character varying, 'entered_in_error'::character varying])::text[]))),
    CONSTRAINT clinic_allergies_criticality CHECK (((criticality)::text = ANY ((ARRAY['low'::character varying, 'high'::character varying, 'unable_to_assess'::character varying])::text[]))),
    CONSTRAINT clinic_allergies_data_status CHECK (((data_status)::text = ANY ((ARRAY['incomplete'::character varying, 'recorded'::character varying])::text[]))),
    CONSTRAINT clinic_allergies_lock_version CHECK ((lock_version >= 0)),
    CONSTRAINT clinic_allergies_recorded_shape CHECK ((((data_status)::text = 'incomplete'::text) OR ((allergen_name IS NOT NULL) AND (recorded_by_membership_id IS NOT NULL) AND (recorded_at IS NOT NULL)))),
    CONSTRAINT clinic_allergies_review_pair CHECK ((((last_reviewed_at IS NULL) AND (reviewed_by_membership_id IS NULL)) OR ((last_reviewed_at IS NOT NULL) AND (reviewed_by_membership_id IS NOT NULL)))),
    CONSTRAINT clinic_allergies_severity CHECK (((severity)::text = ANY ((ARRAY['mild'::character varying, 'moderate'::character varying, 'severe'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT clinic_allergies_verification CHECK (((verification_status)::text = ANY ((ARRAY['unconfirmed'::character varying, 'presumed'::character varying, 'confirmed'::character varying, 'refuted'::character varying, 'entered_in_error'::character varying])::text[])))
);


--
-- Name: clinic_allergies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_allergies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_allergies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_allergies_id_seq OWNED BY public.clinic_allergies.id;


--
-- Name: clinic_appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_appointments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    site_id bigint,
    room_id bigint,
    booked_clinician_id bigint,
    visit_type_id bigint,
    starts_at timestamp(6) with time zone NOT NULL,
    ends_at timestamp(6) with time zone NOT NULL,
    status character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    visit_modality character varying(16) DEFAULT 'in_person'::character varying NOT NULL,
    CONSTRAINT clinic_appointments_room_requires_site CHECK (((room_id IS NULL) OR (site_id IS NOT NULL))),
    CONSTRAINT clinic_appointments_status_present CHECK ((length(TRIM(BOTH FROM status)) > 0)),
    CONSTRAINT clinic_appointments_valid_time_range CHECK ((ends_at > starts_at)),
    CONSTRAINT clinic_appointments_visit_modality CHECK ((((visit_modality)::text = ANY ((ARRAY['in_person'::character varying, 'video'::character varying])::text[])) AND (((visit_modality)::text <> 'video'::text) OR (room_id IS NULL))))
);


--
-- Name: clinic_appointments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_appointments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_appointments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_appointments_id_seq OWNED BY public.clinic_appointments.id;


--
-- Name: clinic_audit_delivery_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_audit_delivery_receipts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    audit_event_id bigint NOT NULL,
    sink_receipt_reference character varying NOT NULL,
    acknowledged_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_audit_receipts_ref_present CHECK ((length(TRIM(BOTH FROM sink_receipt_reference)) > 0))
);


--
-- Name: clinic_audit_delivery_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_audit_delivery_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_audit_delivery_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_audit_delivery_receipts_id_seq OWNED BY public.clinic_audit_delivery_receipts.id;


--
-- Name: clinic_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_audit_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    actor_session_reference character varying NOT NULL,
    action_code character varying NOT NULL,
    outcome character varying NOT NULL,
    policy_version character varying NOT NULL,
    occurred_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_audit_events_values CHECK ((((outcome)::text = ANY ((ARRAY['attempted'::character varying, 'denied'::character varying, 'prepared'::character varying, 'committed'::character varying, 'released'::character varying, 'failed'::character varying])::text[])) AND (length(TRIM(BOTH FROM action_code)) > 0) AND (length(TRIM(BOTH FROM policy_version)) > 0)))
);


--
-- Name: clinic_audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_audit_events_id_seq OWNED BY public.clinic_audit_events.id;


--
-- Name: clinic_audit_resource_manifests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_audit_resource_manifests (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    audit_event_id bigint NOT NULL,
    protected_resource_version_ref character varying CONSTRAINT clinic_audit_resource_manif_protected_resource_version_not_null NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_audit_manifests_ref_present CHECK ((length(TRIM(BOTH FROM protected_resource_version_ref)) > 0))
);


--
-- Name: clinic_audit_resource_manifests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_audit_resource_manifests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_audit_resource_manifests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_audit_resource_manifests_id_seq OWNED BY public.clinic_audit_resource_manifests.id;


--
-- Name: clinic_billing_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_billing_receipts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    payment_event_id bigint NOT NULL,
    issued_by_id bigint NOT NULL,
    kind character varying NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    issued_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT billing_receipt_kind CHECK (((kind)::text = ANY ((ARRAY['cash_payment'::character varying, 'cash_refund'::character varying, 'subscription_payment'::character varying, 'subscription_refund'::character varying, 'card_payment'::character varying])::text[])))
);


--
-- Name: clinic_billing_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_billing_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_billing_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_billing_receipts_id_seq OWNED BY public.clinic_billing_receipts.id;


--
-- Name: clinic_billing_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_billing_services (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    name character varying(160) NOT NULL,
    code character varying(50),
    description character varying(500),
    unit_amount numeric(14,2) NOT NULL,
    currency character varying(3) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_billing_services_code_value CHECK (((code IS NULL) OR (length(TRIM(BOTH FROM code)) > 0))),
    CONSTRAINT clinic_billing_services_values CHECK (((length(TRIM(BOTH FROM name)) > 0) AND (unit_amount >= (0)::numeric) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND (lock_version >= 0)))
);


--
-- Name: clinic_billing_services_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_billing_services_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_billing_services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_billing_services_id_seq OWNED BY public.clinic_billing_services.id;


--
-- Name: clinic_cash_drawer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_cash_drawer_sessions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    opened_by_id bigint NOT NULL,
    closed_by_id bigint,
    status character varying DEFAULT 'open'::character varying NOT NULL,
    opening_float numeric(20,6) NOT NULL,
    counted_cash numeric(20,6),
    discrepancy numeric(20,6),
    discrepancy_explanation text,
    closed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    reconciliation_status character varying DEFAULT 'pending'::character varying NOT NULL,
    reconciled_by_id bigint,
    reconciled_at timestamp(6) without time zone,
    reconciliation_note text,
    reconciliation_request_key character varying,
    CONSTRAINT cash_drawer_reconciliation_state CHECK ((((reconciliation_status)::text = ANY ((ARRAY['pending'::character varying, 'reconciled'::character varying])::text[])) AND ((((reconciliation_status)::text = 'pending'::text) AND (reconciled_by_id IS NULL) AND (reconciled_at IS NULL) AND (reconciliation_request_key IS NULL)) OR (((reconciliation_status)::text = 'reconciled'::text) AND (reconciled_by_id IS NOT NULL) AND (reconciled_at IS NOT NULL) AND (reconciliation_request_key IS NOT NULL))))),
    CONSTRAINT cash_drawer_session_status CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'closed'::character varying])::text[])))
);


--
-- Name: clinic_cash_drawer_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_cash_drawer_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_cash_drawer_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_cash_drawer_sessions_id_seq OWNED BY public.clinic_cash_drawer_sessions.id;


--
-- Name: clinic_cash_tenders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_cash_tenders (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    payment_event_id bigint NOT NULL,
    cash_drawer_session_id bigint NOT NULL,
    tendered_amount numeric(20,6) NOT NULL,
    change_amount numeric(20,6) DEFAULT 0.0 NOT NULL,
    recorded_by_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    request_key character varying NOT NULL,
    CONSTRAINT cash_tender_amounts CHECK (((tendered_amount > (0)::numeric) AND (tendered_amount = round(tendered_amount, 2)) AND (change_amount >= (0)::numeric) AND (change_amount = round(change_amount, 2)) AND (change_amount < tendered_amount))),
    CONSTRAINT cash_tender_request_key_present CHECK (((length(TRIM(BOTH FROM request_key)) >= 1) AND (length(TRIM(BOTH FROM request_key)) <= 100)))
);


--
-- Name: clinic_cash_tenders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_cash_tenders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_cash_tenders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_cash_tenders_id_seq OWNED BY public.clinic_cash_tenders.id;


--
-- Name: clinic_clinician_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_clinician_assignments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    clinician_profile_id bigint NOT NULL,
    department_id bigint NOT NULL,
    site_id bigint NOT NULL,
    effective_from timestamp(6) without time zone NOT NULL,
    effective_until timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_assignments_valid_window CHECK (((effective_until IS NULL) OR (effective_until > effective_from)))
);


--
-- Name: clinic_clinician_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_clinician_assignments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_clinician_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_clinician_assignments_id_seq OWNED BY public.clinic_clinician_assignments.id;


--
-- Name: clinic_clinician_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_clinician_credentials (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    clinician_profile_id bigint NOT NULL,
    credential_type character varying NOT NULL,
    jurisdiction character varying NOT NULL,
    issuer_reference character varying NOT NULL,
    review_status character varying NOT NULL,
    valid_until timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_credentials_fields_present CHECK (((length(TRIM(BOTH FROM credential_type)) > 0) AND (length(TRIM(BOTH FROM jurisdiction)) > 0) AND (length(TRIM(BOTH FROM issuer_reference)) > 0) AND (length(TRIM(BOTH FROM review_status)) > 0)))
);


--
-- Name: clinic_clinician_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_clinician_credentials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_clinician_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_clinician_credentials_id_seq OWNED BY public.clinic_clinician_credentials.id;


--
-- Name: clinic_clinician_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_clinician_profiles (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    membership_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    display_name text,
    reference character varying
);


--
-- Name: clinic_clinician_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_clinician_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_clinician_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_clinician_profiles_id_seq OWNED BY public.clinic_clinician_profiles.id;


--
-- Name: clinic_communication_endpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_communication_endpoints (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    endpoint_type character varying NOT NULL,
    value text NOT NULL,
    value_digest character varying NOT NULL,
    label character varying DEFAULT 'Primary'::character varying NOT NULL,
    verified_at timestamp(6) without time zone,
    invalidated_at timestamp(6) without time zone,
    invalidation_reason character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_communication_endpoints_values CHECK ((((endpoint_type)::text = ANY ((ARRAY['portal'::character varying, 'phone'::character varying, 'email'::character varying])::text[])) AND (length(TRIM(BOTH FROM value_digest)) > 0)))
);


--
-- Name: clinic_communication_endpoints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_communication_endpoints_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_communication_endpoints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_communication_endpoints_id_seq OWNED BY public.clinic_communication_endpoints.id;


--
-- Name: clinic_communication_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_communication_preferences (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    category character varying NOT NULL,
    channel character varying NOT NULL,
    setting character varying DEFAULT 'not_set'::character varying NOT NULL,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    timezone character varying NOT NULL,
    locale character varying DEFAULT 'en-US'::character varying NOT NULL,
    effective_at timestamp(6) without time zone NOT NULL,
    source character varying DEFAULT 'patient'::character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_communication_preferences_values CHECK ((((category)::text = ANY ((ARRAY['operational'::character varying, 'marketing'::character varying])::text[])) AND ((channel)::text = ANY ((ARRAY['portal'::character varying, 'sms'::character varying, 'email'::character varying])::text[])) AND ((setting)::text = ANY ((ARRAY['allowed'::character varying, 'blocked'::character varying, 'not_set'::character varying])::text[])) AND (version > 0)))
);


--
-- Name: clinic_communication_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_communication_preferences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_communication_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_communication_preferences_id_seq OWNED BY public.clinic_communication_preferences.id;


--
-- Name: clinic_conditions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_conditions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    data_status character varying DEFAULT 'incomplete'::character varying NOT NULL,
    recorded_by_membership_id bigint,
    reviewed_by_membership_id bigint,
    recorded_at timestamp(6) with time zone,
    last_reviewed_at timestamp(6) with time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    condition_name text,
    clinical_status character varying DEFAULT 'unknown'::character varying NOT NULL,
    verification_status character varying DEFAULT 'unconfirmed'::character varying NOT NULL,
    affects_current_care boolean DEFAULT false NOT NULL,
    care_instruction text,
    onset_at timestamp(6) with time zone,
    resolved_at timestamp(6) with time zone,
    CONSTRAINT clinic_conditions_clinical_status CHECK (((clinical_status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'resolved'::character varying, 'unknown'::character varying, 'entered_in_error'::character varying])::text[]))),
    CONSTRAINT clinic_conditions_data_status CHECK (((data_status)::text = ANY ((ARRAY['incomplete'::character varying, 'recorded'::character varying])::text[]))),
    CONSTRAINT clinic_conditions_lock_version CHECK ((lock_version >= 0)),
    CONSTRAINT clinic_conditions_recorded_shape CHECK ((((data_status)::text = 'incomplete'::text) OR ((condition_name IS NOT NULL) AND (recorded_by_membership_id IS NOT NULL) AND (recorded_at IS NOT NULL)))),
    CONSTRAINT clinic_conditions_review_pair CHECK ((((last_reviewed_at IS NULL) AND (reviewed_by_membership_id IS NULL)) OR ((last_reviewed_at IS NOT NULL) AND (reviewed_by_membership_id IS NOT NULL)))),
    CONSTRAINT clinic_conditions_valid_window CHECK (((resolved_at IS NULL) OR (onset_at IS NULL) OR (resolved_at >= onset_at))),
    CONSTRAINT clinic_conditions_verification CHECK (((verification_status)::text = ANY ((ARRAY['unconfirmed'::character varying, 'provisional'::character varying, 'confirmed'::character varying, 'refuted'::character varying, 'entered_in_error'::character varying])::text[])))
);


--
-- Name: clinic_conditions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_conditions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_conditions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_conditions_id_seq OWNED BY public.clinic_conditions.id;


--
-- Name: clinic_coverage_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_coverage_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    version integer NOT NULL,
    encrypted_coverage_evidence text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_coverage_versions_version_positive CHECK ((version > 0))
);


--
-- Name: clinic_coverage_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_coverage_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_coverage_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_coverage_versions_id_seq OWNED BY public.clinic_coverage_versions.id;


--
-- Name: clinic_credit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_credit_notes (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    currency character varying NOT NULL,
    amount numeric(20,6) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    reason text,
    issued_by_membership_id bigint,
    issued_at timestamp(6) without time zone,
    CONSTRAINT clinic_credit_notes_evidence_shape CHECK ((((reason IS NULL) AND (issued_by_membership_id IS NULL) AND (issued_at IS NULL)) OR ((reason IS NOT NULL) AND (issued_by_membership_id IS NOT NULL) AND (issued_at IS NOT NULL)))),
    CONSTRAINT clinic_credit_notes_values CHECK ((((currency)::text ~ '^[A-Z]{3}$'::text) AND (amount > (0)::numeric)))
);


--
-- Name: clinic_credit_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_credit_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_credit_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_credit_notes_id_seq OWNED BY public.clinic_credit_notes.id;


--
-- Name: clinic_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_departments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    code character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_departments_code_present CHECK ((length(TRIM(BOTH FROM code)) > 0))
);


--
-- Name: clinic_departments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_departments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_departments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_departments_id_seq OWNED BY public.clinic_departments.id;


--
-- Name: clinic_document_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_document_categories (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_document_categories_values CHECK (((length(TRIM(BOTH FROM code)) > 0) AND (length(TRIM(BOTH FROM name)) > 0)))
);


--
-- Name: clinic_document_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_document_categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_document_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_document_categories_id_seq OWNED BY public.clinic_document_categories.id;


--
-- Name: clinic_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_documents (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint,
    category_id bigint NOT NULL,
    object_key character varying NOT NULL,
    object_version character varying NOT NULL,
    checksum character varying NOT NULL,
    byte_size bigint NOT NULL,
    media_type character varying NOT NULL,
    scan_state character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_documents_scan_state CHECK (((scan_state)::text = ANY ((ARRAY['pending'::character varying, 'quarantined'::character varying, 'clean'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT clinic_documents_values CHECK (((byte_size >= 0) AND (length(TRIM(BOTH FROM object_key)) > 0) AND (length(TRIM(BOTH FROM object_version)) > 0) AND (length(TRIM(BOTH FROM checksum)) > 0) AND (length(TRIM(BOTH FROM media_type)) > 0)))
);


--
-- Name: clinic_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_documents_id_seq OWNED BY public.clinic_documents.id;


--
-- Name: clinic_encounter_follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_encounter_follow_ups (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    follow_up_appointment_id bigint,
    assigned_to_membership_id bigint,
    recorded_by_membership_id bigint NOT NULL,
    updated_by_membership_id bigint NOT NULL,
    completed_by_membership_id bigint,
    source_kind character varying NOT NULL,
    state character varying NOT NULL,
    plan text NOT NULL,
    outcome text NOT NULL,
    due_at timestamp(6) without time zone,
    completed_at timestamp(6) without time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT encounter_follow_ups_arranged_appointment CHECK ((((state)::text <> 'arranged'::text) OR (follow_up_appointment_id IS NOT NULL))),
    CONSTRAINT encounter_follow_ups_completion_evidence CHECK ((((state)::text <> 'completed'::text) OR ((completed_at IS NOT NULL) AND (completed_by_membership_id IS NOT NULL) AND (outcome <> ''::text)))),
    CONSTRAINT encounter_follow_ups_source_kind CHECK (((source_kind)::text = ANY ((ARRAY['in_person'::character varying, 'telehealth'::character varying])::text[]))),
    CONSTRAINT encounter_follow_ups_state CHECK (((state)::text = ANY ((ARRAY['not_required'::character varying, 'needed'::character varying, 'arranged'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: clinic_encounter_follow_ups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_encounter_follow_ups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_encounter_follow_ups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_encounter_follow_ups_id_seq OWNED BY public.clinic_encounter_follow_ups.id;


--
-- Name: clinic_encounter_note_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_encounter_note_revisions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    note_id bigint NOT NULL,
    revision_no integer NOT NULL,
    prior_revision_id bigint,
    author_membership_id bigint NOT NULL,
    encrypted_body text NOT NULL,
    payload_version integer NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_note_revisions_values CHECK (((revision_no > 0) AND (payload_version > 0) AND ((prior_revision_id IS NULL) OR (prior_revision_id <> id))))
);


--
-- Name: clinic_encounter_note_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_encounter_note_revisions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_encounter_note_revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_encounter_note_revisions_id_seq OWNED BY public.clinic_encounter_note_revisions.id;


--
-- Name: clinic_encounter_note_signatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_encounter_note_signatures (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    note_id bigint NOT NULL,
    revision_id bigint NOT NULL,
    signer_membership_id bigint NOT NULL,
    content_digest character varying NOT NULL,
    attestation_version character varying NOT NULL,
    signed_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_note_signatures_fields_present CHECK (((length(TRIM(BOTH FROM content_digest)) > 0) AND (length(TRIM(BOTH FROM attestation_version)) > 0)))
);


--
-- Name: clinic_encounter_note_signatures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_encounter_note_signatures_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_encounter_note_signatures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_encounter_note_signatures_id_seq OWNED BY public.clinic_encounter_note_signatures.id;


--
-- Name: clinic_encounter_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_encounter_notes (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    note_kind character varying DEFAULT 'legacy'::character varying NOT NULL,
    CONSTRAINT clinic_encounter_notes_kind CHECK (((length(TRIM(BOTH FROM note_kind)) > 0) AND ((note_kind)::text ~ '^[a-z][a-z0-9_]*$'::text))),
    CONSTRAINT clinic_encounter_notes_lock_version CHECK ((lock_version >= 0))
);


--
-- Name: clinic_encounter_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_encounter_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_encounter_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_encounter_notes_id_seq OWNED BY public.clinic_encounter_notes.id;


--
-- Name: clinic_encounter_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_encounter_participants (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    membership_id bigint NOT NULL,
    participation_role character varying NOT NULL,
    effective_from timestamp(6) with time zone NOT NULL,
    effective_until timestamp(6) with time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_participants_role_present CHECK ((length(TRIM(BOTH FROM participation_role)) > 0)),
    CONSTRAINT clinic_participants_valid_window CHECK (((effective_until IS NULL) OR (effective_until > effective_from)))
);


--
-- Name: clinic_encounter_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_encounter_participants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_encounter_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_encounter_participants_id_seq OWNED BY public.clinic_encounter_participants.id;


--
-- Name: clinic_encounter_precautions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_encounter_precautions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    precaution_type character varying NOT NULL,
    evidence_status character varying NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    instructions text,
    recorded_by_membership_id bigint NOT NULL,
    recorded_at timestamp(6) with time zone NOT NULL,
    reassessed_by_membership_id bigint,
    last_reassessed_at timestamp(6) with time zone,
    ended_at timestamp(6) with time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_precautions_discontinued_at CHECK ((((status)::text <> 'discontinued'::text) OR (ended_at IS NOT NULL))),
    CONSTRAINT clinic_precautions_evidence CHECK (((evidence_status)::text = ANY ((ARRAY['suspected'::character varying, 'confirmed'::character varying])::text[]))),
    CONSTRAINT clinic_precautions_lock_version CHECK ((lock_version >= 0)),
    CONSTRAINT clinic_precautions_reassessment_pair CHECK ((((last_reassessed_at IS NULL) AND (reassessed_by_membership_id IS NULL)) OR ((last_reassessed_at IS NOT NULL) AND (reassessed_by_membership_id IS NOT NULL)))),
    CONSTRAINT clinic_precautions_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'discontinued'::character varying, 'entered_in_error'::character varying])::text[]))),
    CONSTRAINT clinic_precautions_type CHECK (((precaution_type)::text = ANY ((ARRAY['contact'::character varying, 'droplet'::character varying, 'airborne'::character varying, 'protective'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT clinic_precautions_valid_window CHECK (((ended_at IS NULL) OR (ended_at >= recorded_at)))
);


--
-- Name: clinic_encounter_precautions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_encounter_precautions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_encounter_precautions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_encounter_precautions_id_seq OWNED BY public.clinic_encounter_precautions.id;


--
-- Name: clinic_encounters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_encounters (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    appointment_id bigint,
    site_id bigint,
    room_id bigint,
    started_at timestamp(6) with time zone NOT NULL,
    ended_at timestamp(6) with time zone,
    status character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_encounters_room_requires_site CHECK (((room_id IS NULL) OR (site_id IS NOT NULL))),
    CONSTRAINT clinic_encounters_status_present CHECK ((length(TRIM(BOTH FROM status)) > 0)),
    CONSTRAINT clinic_encounters_valid_time_range CHECK (((ended_at IS NULL) OR (ended_at > started_at)))
);


--
-- Name: clinic_encounters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_encounters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_encounters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_encounters_id_seq OWNED BY public.clinic_encounters.id;


--
-- Name: clinic_insurance_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_insurance_claims (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    coverage_version_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_insurance_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_insurance_claims_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_insurance_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_insurance_claims_id_seq OWNED BY public.clinic_insurance_claims.id;


--
-- Name: clinic_inventory_catalog_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_catalog_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    product_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    changed_fields character varying[] NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    profile_id bigint
);


--
-- Name: clinic_inventory_catalog_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_catalog_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_catalog_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_catalog_events_id_seq OWNED BY public.clinic_inventory_catalog_events.id;


--
-- Name: clinic_inventory_control_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_control_reviews (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    count_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    kind character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_control_review_values CHECK ((((kind)::text = ANY ((ARRAY['investigation'::character varying, 'certification'::character varying])::text[])) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((length(TRIM(BOTH FROM request_key)) >= 1) AND (length(TRIM(BOTH FROM request_key)) <= 100))))
);


--
-- Name: clinic_inventory_control_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_control_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_control_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_control_reviews_id_seq OWNED BY public.clinic_inventory_control_reviews.id;


--
-- Name: clinic_inventory_count_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_count_approvals (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    count_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    entry_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    profile_id bigint
);


--
-- Name: clinic_inventory_count_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_count_approvals_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_count_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_count_approvals_id_seq OWNED BY public.clinic_inventory_count_approvals.id;


--
-- Name: clinic_inventory_count_session_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_count_session_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    count_session_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    count_session_line_id bigint,
    count_id bigint,
    assignee_id bigint,
    kind character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_count_session_event_kind CHECK (((kind)::text = ANY ((ARRAY['observed'::character varying, 'skipped'::character varying, 'resumed'::character varying, 'reassigned'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT inventory_count_session_event_shape CHECK (((((kind)::text = 'observed'::text) AND (count_session_line_id IS NOT NULL) AND (count_id IS NOT NULL) AND (assignee_id IS NULL)) OR (((kind)::text = ANY ((ARRAY['skipped'::character varying, 'resumed'::character varying])::text[])) AND (count_session_line_id IS NOT NULL) AND (count_id IS NULL) AND (assignee_id IS NULL)) OR (((kind)::text = 'reassigned'::text) AND (count_session_line_id IS NULL) AND (count_id IS NULL) AND (assignee_id IS NOT NULL)) OR (((kind)::text = ANY ((ARRAY['completed'::character varying, 'cancelled'::character varying])::text[])) AND (count_session_line_id IS NULL) AND (count_id IS NULL) AND (assignee_id IS NULL)))),
    CONSTRAINT inventory_count_session_event_values CHECK ((((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((request_key)::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) AND ((payload_digest)::text ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: clinic_inventory_count_session_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_count_session_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_count_session_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_count_session_events_id_seq OWNED BY public.clinic_inventory_count_session_events.id;


--
-- Name: clinic_inventory_count_session_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_count_session_lines (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    count_session_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_inventory_count_session_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_count_session_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_count_session_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_count_session_lines_id_seq OWNED BY public.clinic_inventory_count_session_lines.id;


--
-- Name: clinic_inventory_count_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_count_sessions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    location_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    assignee_id bigint NOT NULL,
    due_on date NOT NULL,
    blind boolean DEFAULT true NOT NULL,
    scope_transaction_id bigint DEFAULT txid_current() NOT NULL,
    status character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_count_session_status CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT inventory_count_session_values CHECK ((((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((request_key)::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) AND ((payload_digest)::text ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: clinic_inventory_count_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_count_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_count_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_count_sessions_id_seq OWNED BY public.clinic_inventory_count_sessions.id;


--
-- Name: clinic_inventory_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_counts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    profile_id bigint NOT NULL,
    cutoff_entry_id bigint,
    expected_quantity numeric NOT NULL,
    observed_quantity numeric NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    count_session_line_id bigint,
    CONSTRAINT inventory_count_values CHECK ((((expected_quantity >= (0)::numeric) AND (expected_quantity <= (1000000)::numeric)) AND ((observed_quantity >= (0)::numeric) AND (observed_quantity <= (1000000)::numeric)) AND (observed_quantity = round(observed_quantity, 6))))
);


--
-- Name: clinic_inventory_counts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_counts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_counts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_counts_id_seq OWNED BY public.clinic_inventory_counts.id;


--
-- Name: clinic_inventory_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_entries (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    actor_id bigint,
    batch_id bigint,
    item_id bigint,
    receipt_line_id bigint,
    profile_id bigint,
    legacy_id bigint,
    stock_type character varying NOT NULL,
    kind character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    stock_unit character varying NOT NULL,
    origin character varying DEFAULT 'posted'::character varying NOT NULL,
    quantity numeric NOT NULL,
    occurred_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    count_id bigint,
    transfer_id bigint,
    recall_disposition_id bigint,
    CONSTRAINT inventory_count_entry CHECK ((((kind)::text = 'count_correction'::text) = (count_id IS NOT NULL))),
    CONSTRAINT inventory_entry_direction CHECK (((((kind)::text = ANY ((ARRAY['receipt'::character varying, 'adjustment_in'::character varying])::text[])) AND (quantity > (0)::numeric)) OR (((kind)::text = ANY ((ARRAY['adjustment_out'::character varying, 'damaged'::character varying, 'expired'::character varying, 'return_to_supplier'::character varying])::text[])) AND (quantity < (0)::numeric)) OR ((kind)::text = ANY ((ARRAY['office_adjustment'::character varying, 'count_correction'::character varying, 'opening_balance'::character varying])::text[])))),
    CONSTRAINT inventory_entry_provenance CHECK ((((origin)::text = ANY ((ARRAY['posted'::character varying, 'legacy_movement'::character varying, 'legacy_opening_balance'::character varying])::text[])) AND ((actor_id IS NOT NULL) OR ((origin)::text = 'legacy_opening_balance'::text)) AND (((origin)::text <> 'posted'::text) OR (profile_id IS NOT NULL)))),
    CONSTRAINT inventory_entry_target CHECK (((((stock_type)::text = 'pharmacy'::text) AND (batch_id IS NOT NULL) AND (item_id IS NULL)) OR (((stock_type)::text = 'office'::text) AND (item_id IS NOT NULL) AND (batch_id IS NULL)))),
    CONSTRAINT inventory_entry_values CHECK (((quantity <> (0)::numeric) AND ((quantity >= ('-1000000'::integer)::numeric) AND (quantity <= (1000000)::numeric)) AND (quantity = round(quantity, 6)) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((length((request_key)::text) >= 1) AND (length((request_key)::text) <= 100))))
);


--
-- Name: clinic_inventory_entries_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_entries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_entries_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_entries_id_seq OWNED BY public.clinic_inventory_entries.id;


--
-- Name: clinic_inventory_exception_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_exception_reviews (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    source_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    profile_id bigint NOT NULL,
    assignee_id bigint,
    source_kind character varying NOT NULL,
    category character varying NOT NULL,
    state character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    evidence_reference character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_exception_review_source_category CHECK (((((source_kind)::text = 'batch'::text) AND ((category)::text = ANY ((ARRAY['expiring'::character varying, 'expired'::character varying, 'inactive_product'::character varying, 'inactive_location'::character varying])::text[]))) OR (((source_kind)::text = 'hold'::text) AND ((category)::text = 'hold'::text)) OR (((source_kind)::text = 'reconciliation'::text) AND ((category)::text = 'delivery_discrepancy'::text)))),
    CONSTRAINT inventory_exception_review_state CHECK (((state)::text = ANY ((ARRAY['open'::character varying, 'reviewed'::character varying])::text[]))),
    CONSTRAINT inventory_exception_review_values CHECK ((((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((evidence_reference IS NULL) OR ((length(TRIM(BOTH FROM evidence_reference)) >= 1) AND (length(TRIM(BOTH FROM evidence_reference)) <= 200))) AND ((request_key)::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) AND ((payload_digest)::text ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: clinic_inventory_exception_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_exception_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_exception_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_exception_reviews_id_seq OWNED BY public.clinic_inventory_exception_reviews.id;


--
-- Name: clinic_inventory_hold_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_hold_releases (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    hold_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    profile_id bigint,
    CONSTRAINT inventory_release_reason CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)))
);


--
-- Name: clinic_inventory_hold_releases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_hold_releases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_hold_releases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_hold_releases_id_seq OWNED BY public.clinic_inventory_hold_releases.id;


--
-- Name: clinic_inventory_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_holds (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    actor_id bigint,
    kind character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    profile_id bigint,
    transfer_id bigint,
    recall_id bigint,
    CONSTRAINT inventory_hold_reason CHECK ((((kind)::text = ANY ((ARRAY['quarantined'::character varying, 'recalled'::character varying, 'temperature'::character varying, 'damaged'::character varying])::text[])) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200))))
);


--
-- Name: clinic_inventory_holds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_holds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_holds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_holds_id_seq OWNED BY public.clinic_inventory_holds.id;


--
-- Name: clinic_inventory_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_locations (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    name character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    kind character varying,
    address_line1 character varying,
    address_line2 character varying,
    city character varying,
    state character varying,
    postal_code character varying,
    country character varying DEFAULT 'US'::character varying NOT NULL,
    site_id bigint,
    parent_location_id bigint,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    CONSTRAINT inventory_location_kind CHECK (((kind)::text = ANY ((ARRAY['storage'::character varying, 'quarantine'::character varying, 'returns'::character varying, 'controlled'::character varying])::text[]))),
    CONSTRAINT inventory_location_not_self_parent CHECK (((parent_location_id IS NULL) OR (parent_location_id <> id))),
    CONSTRAINT inventory_location_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'retired'::character varying])::text[])))
);


--
-- Name: clinic_inventory_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_locations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_locations_id_seq OWNED BY public.clinic_inventory_locations.id;


--
-- Name: clinic_inventory_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_lots (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    product_id bigint NOT NULL,
    number character varying NOT NULL,
    expires_on date NOT NULL,
    expiry_precision character varying DEFAULT 'day'::character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_expiry_precision CHECK (((expiry_precision)::text = ANY ((ARRAY['day'::character varying, 'month'::character varying])::text[])))
);


--
-- Name: clinic_inventory_lots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_lots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_lots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_lots_id_seq OWNED BY public.clinic_inventory_lots.id;


--
-- Name: clinic_inventory_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_profiles (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    version integer NOT NULL,
    status character varying DEFAULT 'synthetic'::character varying NOT NULL,
    capabilities character varying[] DEFAULT '{inventory}'::character varying[] NOT NULL,
    operator_reference character varying,
    actor_id bigint,
    reason character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_profile_scope CHECK (((version > 0) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'configured'::character varying, 'synthetic'::character varying, 'suspended'::character varying, 'retired'::character varying])::text[])) AND (capabilities <@ ARRAY['inventory'::character varying])))
);


--
-- Name: clinic_inventory_profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_profiles_id_seq OWNED BY public.clinic_inventory_profiles.id;


--
-- Name: clinic_inventory_purchase_cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_purchase_cart_items (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    cart_id bigint NOT NULL,
    product_id bigint NOT NULL,
    requested_packages numeric(20,6) CONSTRAINT clinic_inventory_purchase_cart_item_requested_packages_not_null NOT NULL,
    input_unit character varying NOT NULL,
    selected_currency character varying NOT NULL,
    source character varying NOT NULL,
    status character varying NOT NULL,
    conversion_factor numeric(20,6) NOT NULL,
    selected_unit_price numeric(20,6) CONSTRAINT clinic_inventory_purchase_cart_ite_selected_unit_price_not_null NOT NULL,
    selected_package_quantity numeric(20,6) CONSTRAINT clinic_inventory_purchase_ca_selected_package_quantity_not_null NOT NULL,
    selected_supplier_product_id bigint,
    selected_supplier_id bigint,
    price_snapshot_at timestamp(6) without time zone,
    price_snapshot_digest character varying,
    purchase_order_line_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_purchase_cart_item_values CHECK (((requested_packages > (0)::numeric) AND (conversion_factor > (0)::numeric) AND (selected_unit_price >= (0)::numeric) AND (selected_package_quantity > (0)::numeric) AND ((length(TRIM(BOTH FROM input_unit)) >= 1) AND (length(TRIM(BOTH FROM input_unit)) <= 40)) AND (length(TRIM(BOTH FROM selected_currency)) = 3) AND ((source)::text = ANY ((ARRAY['replenishment'::character varying, 'manual'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'checked_out'::character varying, 'removed'::character varying])::text[]))))
);


--
-- Name: clinic_inventory_purchase_cart_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_purchase_cart_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_purchase_cart_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_purchase_cart_items_id_seq OWNED BY public.clinic_inventory_purchase_cart_items.id;


--
-- Name: clinic_inventory_purchase_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_purchase_carts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    destination_site_id bigint,
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    reason character varying,
    request_key character varying,
    checkout_group_id character varying,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_purchase_cart_values CHECK ((((status)::text = ANY ((ARRAY['draft'::character varying, 'checking_out'::character varying, 'checked_out'::character varying, 'abandoned'::character varying])::text[])) AND (version > 0) AND ((reason IS NULL) OR ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)))))
);


--
-- Name: clinic_inventory_purchase_carts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_purchase_carts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_purchase_carts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_purchase_carts_id_seq OWNED BY public.clinic_inventory_purchase_carts.id;


--
-- Name: clinic_inventory_purchase_order_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_purchase_order_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    purchase_order_id bigint CONSTRAINT clinic_inventory_purchase_order_even_purchase_order_id_not_null NOT NULL,
    actor_id bigint NOT NULL,
    from_status character varying NOT NULL,
    to_status character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_purchase_order_event_values CHECK ((((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((length(TRIM(BOTH FROM request_key)) >= 1) AND (length(TRIM(BOTH FROM request_key)) <= 100))))
);


--
-- Name: clinic_inventory_purchase_order_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_purchase_order_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_purchase_order_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_purchase_order_events_id_seq OWNED BY public.clinic_inventory_purchase_order_events.id;


--
-- Name: clinic_inventory_purchase_order_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_purchase_order_lines (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    purchase_order_id bigint CONSTRAINT clinic_inventory_purchase_order_line_purchase_order_id_not_null NOT NULL,
    product_id bigint NOT NULL,
    product_name character varying NOT NULL,
    stock_unit character varying NOT NULL,
    input_unit character varying NOT NULL,
    ordered_quantity numeric(20,6) NOT NULL,
    received_quantity numeric(20,6) CONSTRAINT clinic_inventory_purchase_order_line_received_quantity_not_null NOT NULL,
    conversion_factor numeric(20,6) CONSTRAINT clinic_inventory_purchase_order_line_conversion_factor_not_null NOT NULL,
    unit_price numeric(20,6) NOT NULL,
    currency character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    cart_item_id bigint,
    supplier_product_id bigint,
    supplier_sku character varying,
    ordered_package_quantity numeric(20,6),
    price_snapshot_at timestamp(6) without time zone,
    price_snapshot_digest character varying,
    CONSTRAINT inventory_purchase_order_line_values CHECK (((ordered_quantity > (0)::numeric) AND ((received_quantity >= (0)::numeric) AND (received_quantity <= ordered_quantity)) AND (conversion_factor > (0)::numeric) AND (unit_price >= (0)::numeric) AND ((length(TRIM(BOTH FROM product_name)) >= 1) AND (length(TRIM(BOTH FROM product_name)) <= 160)) AND ((length(TRIM(BOTH FROM stock_unit)) >= 1) AND (length(TRIM(BOTH FROM stock_unit)) <= 20)) AND ((length(TRIM(BOTH FROM input_unit)) >= 1) AND (length(TRIM(BOTH FROM input_unit)) <= 20))))
);


--
-- Name: clinic_inventory_purchase_order_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_purchase_order_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_purchase_order_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_purchase_order_lines_id_seq OWNED BY public.clinic_inventory_purchase_order_lines.id;


--
-- Name: clinic_inventory_purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_purchase_orders (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    supplier_id bigint,
    number character varying NOT NULL,
    status character varying NOT NULL,
    destination character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    subtotal numeric(20,6) DEFAULT 0.0 NOT NULL,
    tax numeric(20,6) DEFAULT 0.0 NOT NULL,
    shipping numeric(20,6) DEFAULT 0.0 NOT NULL,
    total numeric(20,6) DEFAULT 0.0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    destination_address text,
    receiving_site_id bigint,
    purchase_cart_id bigint,
    checkout_group_id character varying,
    source_kind character varying,
    currency character varying,
    CONSTRAINT inventory_purchase_order_values CHECK ((((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'approved'::character varying, 'rejected'::character varying, 'sent'::character varying, 'partially_received'::character varying, 'complete'::character varying, 'cancelled'::character varying])::text[])) AND (version > 0) AND (subtotal >= (0)::numeric) AND (tax >= (0)::numeric) AND (shipping >= (0)::numeric) AND (total >= (0)::numeric) AND ((length(TRIM(BOTH FROM number)) >= 1) AND (length(TRIM(BOTH FROM number)) <= 80)) AND ((length(TRIM(BOTH FROM destination)) >= 1) AND (length(TRIM(BOTH FROM destination)) <= 120)) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200))))
);


--
-- Name: clinic_inventory_purchase_orders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_purchase_orders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_purchase_orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_purchase_orders_id_seq OWNED BY public.clinic_inventory_purchase_orders.id;


--
-- Name: clinic_inventory_recall_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_recall_closures (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    recall_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    profile_id bigint NOT NULL,
    reason character varying NOT NULL,
    evidence_reference character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_recall_closure_values CHECK ((((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((length(TRIM(BOTH FROM evidence_reference)) >= 1) AND (length(TRIM(BOTH FROM evidence_reference)) <= 200)) AND ((request_key)::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text) AND ((payload_digest)::text ~ '^[0-9a-f]{64}$'::text)))
);


--
-- Name: clinic_inventory_recall_closures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_recall_closures_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_recall_closures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_recall_closures_id_seq OWNED BY public.clinic_inventory_recall_closures.id;


--
-- Name: clinic_inventory_recall_dispositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_recall_dispositions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    recall_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    quantity numeric(20,6) NOT NULL,
    method character varying NOT NULL,
    evidence_reference character varying CONSTRAINT clinic_inventory_recall_disposition_evidence_reference_not_null NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_disposition_values CHECK (((quantity > (0)::numeric) AND ((length(TRIM(BOTH FROM method)) >= 1) AND (length(TRIM(BOTH FROM method)) <= 60)) AND ((length(TRIM(BOTH FROM evidence_reference)) >= 1) AND (length(TRIM(BOTH FROM evidence_reference)) <= 200)) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((length(TRIM(BOTH FROM request_key)) >= 1) AND (length(TRIM(BOTH FROM request_key)) <= 100))))
);


--
-- Name: clinic_inventory_recall_dispositions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_recall_dispositions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_recall_dispositions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_recall_dispositions_id_seq OWNED BY public.clinic_inventory_recall_dispositions.id;


--
-- Name: clinic_inventory_recall_lots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_recall_lots (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    recall_id bigint NOT NULL,
    lot_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_inventory_recall_lots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_recall_lots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_recall_lots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_recall_lots_id_seq OWNED BY public.clinic_inventory_recall_lots.id;


--
-- Name: clinic_inventory_recalls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_recalls (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    product_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    reference character varying NOT NULL,
    status character varying NOT NULL,
    reason character varying NOT NULL,
    required_disposition character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    effective_on date NOT NULL,
    affected_units numeric(20,6) DEFAULT 0.0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_recall_values CHECK ((((status)::text = ANY ((ARRAY['identified'::character varying, 'inventory_locked'::character varying, 'location_sweep'::character varying, 'isolated'::character varying, 'disposition_pending'::character varying, 'disposition_complete'::character varying, 'closed'::character varying])::text[])) AND (affected_units >= (0)::numeric) AND ((length(TRIM(BOTH FROM reference)) >= 1) AND (length(TRIM(BOTH FROM reference)) <= 100)) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((length(TRIM(BOTH FROM required_disposition)) >= 1) AND (length(TRIM(BOTH FROM required_disposition)) <= 80))))
);


--
-- Name: clinic_inventory_recalls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_recalls_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_recalls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_recalls_id_seq OWNED BY public.clinic_inventory_recalls.id;


--
-- Name: clinic_inventory_receipt_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_receipt_lines (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    receipt_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    input_quantity numeric NOT NULL,
    conversion_factor numeric NOT NULL,
    quantity numeric NOT NULL,
    input_unit character varying NOT NULL,
    stock_unit character varying NOT NULL,
    unit_cost numeric,
    currency character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    purchase_order_line_id bigint,
    area_id character varying,
    temperature_c numeric(8,2),
    exception character varying,
    disposition character varying,
    CONSTRAINT inventory_cost_currency CHECK (((unit_cost IS NULL) OR (currency IS NOT NULL))),
    CONSTRAINT inventory_receipt_conversion CHECK (((input_quantity > (0)::numeric) AND (input_quantity <= (1000000)::numeric) AND (conversion_factor > (0)::numeric) AND (conversion_factor <= (1000000)::numeric) AND (quantity = (input_quantity * conversion_factor)) AND (quantity > (0)::numeric) AND (quantity <= (1000000)::numeric) AND (quantity = round(quantity, 6)))),
    CONSTRAINT inventory_receipt_cost CHECK ((((unit_cost IS NULL) AND (currency IS NULL)) OR ((unit_cost IS NOT NULL) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND ((unit_cost >= (0)::numeric) AND (unit_cost <= (1000000000)::numeric)) AND (unit_cost = round(unit_cost, 6)))))
);


--
-- Name: clinic_inventory_receipt_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_receipt_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_receipt_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_receipt_lines_id_seq OWNED BY public.clinic_inventory_receipt_lines.id;


--
-- Name: clinic_inventory_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_receipts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    profile_id bigint NOT NULL,
    supplier_id bigint,
    received_at timestamp(6) without time zone NOT NULL,
    invoice_reference character varying,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    reason character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    purchase_order_id bigint,
    shipment_id bigint,
    status character varying DEFAULT 'received'::character varying NOT NULL,
    CONSTRAINT inventory_receipt_status CHECK (((status)::text = ANY ((ARRAY['received'::character varying, 'quarantined'::character varying, 'exception'::character varying])::text[])))
);


--
-- Name: clinic_inventory_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_receipts_id_seq OWNED BY public.clinic_inventory_receipts.id;


--
-- Name: clinic_inventory_receiving_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_receiving_sessions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    purchase_order_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    reference character varying(160) NOT NULL,
    reason character varying(200) NOT NULL,
    request_key character varying(36) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT receiving_sessions_details CHECK (((jsonb_typeof(details) = 'object'::text) AND (octet_length((details)::text) <= 128000))),
    CONSTRAINT receiving_sessions_input CHECK (((length(TRIM(BOTH FROM reference)) > 0) AND (length(TRIM(BOTH FROM reason)) > 0) AND (length((request_key)::text) = 36) AND (length((payload_digest)::text) = 64)))
);


--
-- Name: clinic_inventory_receiving_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_receiving_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_receiving_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_receiving_sessions_id_seq OWNED BY public.clinic_inventory_receiving_sessions.id;


--
-- Name: clinic_inventory_shipment_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_shipment_lines (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    shipment_id bigint NOT NULL,
    purchase_order_line_id bigint NOT NULL,
    expected_packages numeric(20,6) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_shipment_line_values CHECK ((expected_packages > (0)::numeric)),
    CONSTRAINT inventory_shipment_line_whole_packages CHECK ((expected_packages = trunc(expected_packages)))
);


--
-- Name: clinic_inventory_shipment_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_shipment_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_shipment_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_shipment_lines_id_seq OWNED BY public.clinic_inventory_shipment_lines.id;


--
-- Name: clinic_inventory_shipment_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_shipment_reconciliations (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    shipment_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    profile_id bigint NOT NULL,
    receipt_id bigint,
    accepted_packages numeric(20,6) CONSTRAINT clinic_inventory_shipment_reconcilia_accepted_packages_not_null NOT NULL,
    missing_packages numeric(20,6) CONSTRAINT clinic_inventory_shipment_reconciliat_missing_packages_not_null NOT NULL,
    rejected_packages numeric(20,6) CONSTRAINT clinic_inventory_shipment_reconcilia_rejected_packages_not_null NOT NULL,
    excess_packages numeric(20,6) CONSTRAINT clinic_inventory_shipment_reconciliati_excess_packages_not_null NOT NULL,
    exception character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying CONSTRAINT clinic_inventory_shipment_reconciliatio_payload_digest_not_null NOT NULL,
    observations jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_reconciliation_observations CHECK (((jsonb_typeof(observations) = 'array'::text) AND ((jsonb_array_length(observations) >= 1) AND (jsonb_array_length(observations) <= 100)) AND (octet_length((observations)::text) <= 64000))),
    CONSTRAINT inventory_reconciliation_quantities CHECK ((((accepted_packages >= (0)::numeric) AND (accepted_packages <= (1000000)::numeric)) AND (accepted_packages = trunc(accepted_packages)) AND ((missing_packages >= (0)::numeric) AND (missing_packages <= (1000000)::numeric)) AND (missing_packages = trunc(missing_packages)) AND ((rejected_packages >= (0)::numeric) AND (rejected_packages <= (1000000)::numeric)) AND (rejected_packages = trunc(rejected_packages)) AND ((excess_packages >= (0)::numeric) AND (excess_packages <= (1000000)::numeric)) AND (excess_packages = trunc(excess_packages)))),
    CONSTRAINT inventory_reconciliation_reason CHECK ((((exception)::text = ANY ((ARRAY['short_delivery'::character varying, 'damaged'::character varying, 'wrong_item'::character varying, 'wrong_lot'::character varying, 'temperature'::character varying, 'expiry'::character varying, 'excess'::character varying, 'other'::character varying])::text[])) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND (length((request_key)::text) = 36) AND (length((payload_digest)::text) = 64))),
    CONSTRAINT inventory_reconciliation_shape CHECK (((((missing_packages + rejected_packages) + excess_packages) > (0)::numeric) AND (((accepted_packages = (0)::numeric) AND (receipt_id IS NULL)) OR ((accepted_packages > (0)::numeric) AND (receipt_id IS NOT NULL)))))
);


--
-- Name: clinic_inventory_shipment_reconciliations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_shipment_reconciliations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_shipment_reconciliations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_shipment_reconciliations_id_seq OWNED BY public.clinic_inventory_shipment_reconciliations.id;


--
-- Name: clinic_inventory_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_shipments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    purchase_order_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    reference character varying NOT NULL,
    supplier_reference character varying NOT NULL,
    status character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    package_count integer NOT NULL,
    expected_units numeric(20,6) NOT NULL,
    delivered_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_shipment_values CHECK ((((status)::text = ANY ((ARRAY['expected'::character varying, 'delivered'::character varying, 'received'::character varying, 'exception'::character varying])::text[])) AND (package_count > 0) AND (expected_units > (0)::numeric) AND ((length(TRIM(BOTH FROM reference)) >= 1) AND (length(TRIM(BOTH FROM reference)) <= 80)) AND ((length(TRIM(BOTH FROM supplier_reference)) >= 1) AND (length(TRIM(BOTH FROM supplier_reference)) <= 120))))
);


--
-- Name: clinic_inventory_shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_shipments_id_seq OWNED BY public.clinic_inventory_shipments.id;


--
-- Name: clinic_inventory_supplier_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_supplier_credits (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    purchase_order_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    reference character varying(160) NOT NULL,
    reason character varying(200) NOT NULL,
    request_key character varying(36) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    vendor_return_id bigint NOT NULL,
    amount numeric(20,6) NOT NULL,
    currency character varying(3) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT supplier_credit_amount CHECK (((amount > (0)::numeric) AND ((currency)::text ~ '^[A-Z]{3}$'::text))),
    CONSTRAINT supplier_credits_details CHECK (((jsonb_typeof(details) = 'object'::text) AND (octet_length((details)::text) <= 128000))),
    CONSTRAINT supplier_credits_input CHECK (((length(TRIM(BOTH FROM reference)) > 0) AND (length(TRIM(BOTH FROM reason)) > 0) AND (length((request_key)::text) = 36) AND (length((payload_digest)::text) = 64)))
);


--
-- Name: clinic_inventory_supplier_credits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_supplier_credits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_supplier_credits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_supplier_credits_id_seq OWNED BY public.clinic_inventory_supplier_credits.id;


--
-- Name: clinic_inventory_supplier_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_supplier_invoices (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    purchase_order_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    reference character varying(160) NOT NULL,
    reason character varying(200) NOT NULL,
    request_key character varying(36) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying NOT NULL,
    supersedes_id bigint,
    amount numeric(20,6) NOT NULL,
    currency character varying(3) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT supplier_invoice_amount CHECK (((amount >= (0)::numeric) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND ((status)::text = ANY ((ARRAY['matched'::character varying, 'discrepancy'::character varying])::text[])))),
    CONSTRAINT supplier_invoices_details CHECK (((jsonb_typeof(details) = 'object'::text) AND (octet_length((details)::text) <= 128000))),
    CONSTRAINT supplier_invoices_input CHECK (((length(TRIM(BOTH FROM reference)) > 0) AND (length(TRIM(BOTH FROM reason)) > 0) AND (length((request_key)::text) = 36) AND (length((payload_digest)::text) = 64)))
);


--
-- Name: clinic_inventory_supplier_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_supplier_invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_supplier_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_supplier_invoices_id_seq OWNED BY public.clinic_inventory_supplier_invoices.id;


--
-- Name: clinic_inventory_supplier_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_supplier_products (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    product_id bigint,
    ndc character varying NOT NULL,
    supplier_sku character varying NOT NULL,
    description character varying NOT NULL,
    ordering_unit character varying NOT NULL,
    currency character varying NOT NULL,
    contract_status character varying NOT NULL,
    package_quantity numeric(20,6) NOT NULL,
    wholesale_unit_cost numeric(20,6) NOT NULL,
    available boolean,
    lead_time_days integer,
    effective_date date,
    imported_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_supplier_product_values CHECK (((length(TRIM(BOTH FROM ndc)) = 11) AND ((ndc)::text ~ '^[0-9]{11}$'::text) AND ((length(TRIM(BOTH FROM supplier_sku)) >= 1) AND (length(TRIM(BOTH FROM supplier_sku)) <= 120)) AND ((length(TRIM(BOTH FROM description)) >= 1) AND (length(TRIM(BOTH FROM description)) <= 400)) AND ((length(TRIM(BOTH FROM ordering_unit)) >= 1) AND (length(TRIM(BOTH FROM ordering_unit)) <= 40)) AND (length(TRIM(BOTH FROM currency)) = 3) AND (package_quantity > (0)::numeric) AND (wholesale_unit_cost >= (0)::numeric) AND (wholesale_unit_cost = round(wholesale_unit_cost, 6)) AND ((lead_time_days IS NULL) OR ((lead_time_days >= 0) AND (lead_time_days <= 3650))) AND ((length(TRIM(BOTH FROM contract_status)) >= 1) AND (length(TRIM(BOTH FROM contract_status)) <= 40))))
);


--
-- Name: clinic_inventory_supplier_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_supplier_products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_supplier_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_supplier_products_id_seq OWNED BY public.clinic_inventory_supplier_products.id;


--
-- Name: clinic_inventory_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_suppliers (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    name character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    primary_address_version_id bigint
);


--
-- Name: clinic_inventory_suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_suppliers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_suppliers_id_seq OWNED BY public.clinic_inventory_suppliers.id;


--
-- Name: clinic_inventory_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_transfers (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    source_batch_id bigint NOT NULL,
    destination_batch_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    quantity numeric(20,6) NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT inventory_transfer_values CHECK (((quantity > (0)::numeric) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200)) AND ((length(TRIM(BOTH FROM request_key)) >= 1) AND (length(TRIM(BOTH FROM request_key)) <= 100)) AND (source_batch_id <> destination_batch_id)))
);


--
-- Name: clinic_inventory_transfers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_transfers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_transfers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_transfers_id_seq OWNED BY public.clinic_inventory_transfers.id;


--
-- Name: clinic_inventory_vendor_returns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_vendor_returns (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    purchase_order_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    reference character varying(160) NOT NULL,
    reason character varying(200) NOT NULL,
    request_key character varying(36) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    receipt_line_id bigint NOT NULL,
    entry_id bigint NOT NULL,
    quantity numeric(20,6) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT vendor_return_quantity CHECK (((quantity > (0)::numeric) AND (quantity <= (1000000)::numeric))),
    CONSTRAINT vendor_returns_details CHECK (((jsonb_typeof(details) = 'object'::text) AND (octet_length((details)::text) <= 128000))),
    CONSTRAINT vendor_returns_input CHECK (((length(TRIM(BOTH FROM reference)) > 0) AND (length(TRIM(BOTH FROM reason)) > 0) AND (length((request_key)::text) = 36) AND (length((payload_digest)::text) = 64)))
);


--
-- Name: clinic_inventory_vendor_returns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_inventory_vendor_returns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_inventory_vendor_returns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_inventory_vendor_returns_id_seq OWNED BY public.clinic_inventory_vendor_returns.id;


--
-- Name: clinic_invoice_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_invoice_lines (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    quantity numeric(20,6) NOT NULL,
    unit_amount numeric(20,6) NOT NULL,
    posted_amount numeric(20,6) NOT NULL,
    description_snapshot text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    billing_service_id bigint,
    CONSTRAINT clinic_invoice_lines_values CHECK (((quantity > (0)::numeric) AND (unit_amount >= (0)::numeric) AND (posted_amount >= (0)::numeric) AND (length(TRIM(BOTH FROM description_snapshot)) > 0)))
);


--
-- Name: clinic_invoice_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_invoice_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_invoice_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_invoice_lines_id_seq OWNED BY public.clinic_invoice_lines.id;


--
-- Name: clinic_invoice_stripe_checkouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_invoice_stripe_checkouts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    connection_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    collection_intent_id bigint NOT NULL,
    account_id character varying NOT NULL,
    session_id character varying,
    session_status character varying,
    application_fee_cents integer NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT invoice_stripe_checkouts_values CHECK ((((account_id)::text ~ '^acct_[a-zA-Z0-9]+$'::text) AND (application_fee_cents >= 0) AND ((session_id IS NULL) OR ((session_id)::text ~ '^cs_test_[a-zA-Z0-9]+$'::text)) AND ((session_status IS NULL) OR ((session_status)::text = ANY ((ARRAY['open'::character varying, 'complete'::character varying, 'expired'::character varying])::text[])))))
);


--
-- Name: clinic_invoice_stripe_checkouts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_invoice_stripe_checkouts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_invoice_stripe_checkouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_invoice_stripe_checkouts_id_seq OWNED BY public.clinic_invoice_stripe_checkouts.id;


--
-- Name: clinic_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_invoices (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    currency character varying NOT NULL,
    status character varying NOT NULL,
    rounding_policy_version character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    encounter_id bigint,
    void_reason text,
    voided_by_membership_id bigint,
    voided_at timestamp(6) without time zone,
    CONSTRAINT clinic_invoices_values CHECK ((((currency)::text ~ '^[A-Z]{3}$'::text) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'posted'::character varying, 'void'::character varying])::text[])) AND (length(TRIM(BOTH FROM status)) > 0) AND (length(TRIM(BOTH FROM rounding_policy_version)) > 0))),
    CONSTRAINT clinic_invoices_void_evidence_shape CHECK ((((void_reason IS NULL) AND (voided_by_membership_id IS NULL) AND (voided_at IS NULL)) OR ((void_reason IS NOT NULL) AND (voided_by_membership_id IS NOT NULL) AND (voided_at IS NOT NULL))))
);


--
-- Name: clinic_invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_invoices_id_seq OWNED BY public.clinic_invoices.id;


--
-- Name: clinic_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_items (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    name character varying NOT NULL,
    sku character varying NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    reorder_level integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_stock_nonnegative CHECK (((quantity >= 0) AND (reorder_level >= 0))),
    CONSTRAINT inventory_office_range CHECK (((quantity >= 0) AND (quantity <= 1000000)))
);


--
-- Name: clinic_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_items_id_seq OWNED BY public.clinic_items.id;


--
-- Name: clinic_lab_report_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_lab_report_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    lab_report_id bigint NOT NULL,
    version_number integer NOT NULL,
    title text NOT NULL,
    status character varying NOT NULL,
    collected_at timestamp(6) with time zone NOT NULL,
    issued_at timestamp(6) with time zone NOT NULL,
    results_payload text NOT NULL,
    entry_kind character varying DEFAULT 'manual'::character varying NOT NULL,
    content_digest character varying(64) NOT NULL,
    recorded_by_membership_id bigint NOT NULL,
    recorded_at timestamp(6) with time zone NOT NULL,
    reviewed_by_membership_id bigint,
    reviewed_at timestamp(6) with time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_lab_report_versions_review_pair CHECK ((((reviewed_at IS NULL) AND (reviewed_by_membership_id IS NULL)) OR ((reviewed_at IS NOT NULL) AND (reviewed_by_membership_id IS NOT NULL)))),
    CONSTRAINT clinic_lab_report_versions_timeline CHECK ((issued_at >= collected_at)),
    CONSTRAINT clinic_lab_report_versions_values CHECK (((version_number > 0) AND ((status)::text = ANY ((ARRAY['preliminary'::character varying, 'final'::character varying, 'amended'::character varying, 'corrected'::character varying, 'cancelled'::character varying])::text[])) AND ((entry_kind)::text = 'manual'::text) AND (length((content_digest)::text) = 64)))
);


--
-- Name: clinic_lab_report_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_lab_report_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_lab_report_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_lab_report_versions_id_seq OWNED BY public.clinic_lab_report_versions.id;


--
-- Name: clinic_lab_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_lab_reports (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    source_name character varying(160) NOT NULL,
    external_report_id text,
    external_report_id_digest character varying(64),
    current_version_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_lab_reports_values CHECK (((length(TRIM(BOTH FROM source_name)) > 0) AND ((external_report_id_digest IS NULL) OR (length((external_report_id_digest)::text) = 64))))
);


--
-- Name: clinic_lab_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_lab_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_lab_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_lab_reports_id_seq OWNED BY public.clinic_lab_reports.id;


--
-- Name: clinic_lab_result_follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_lab_result_follow_ups (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    lab_report_id bigint NOT NULL,
    lab_report_version_id bigint NOT NULL,
    state character varying NOT NULL,
    instructions text,
    outcome text,
    recorded_by_membership_id bigint NOT NULL,
    recorded_at timestamp(6) with time zone NOT NULL,
    completed_by_membership_id bigint,
    completed_at timestamp(6) with time zone,
    superseded_at timestamp(6) with time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_lab_follow_ups_state_evidence CHECK (((((state)::text = 'open'::text) AND (instructions IS NOT NULL) AND (outcome IS NULL) AND (completed_at IS NULL) AND (completed_by_membership_id IS NULL) AND (superseded_at IS NULL)) OR (((state)::text = 'completed'::text) AND (instructions IS NOT NULL) AND (outcome IS NOT NULL) AND (completed_at IS NOT NULL) AND (completed_by_membership_id IS NOT NULL) AND (superseded_at IS NULL)) OR (((state)::text = 'not_required'::text) AND (outcome IS NULL) AND (completed_at IS NULL) AND (completed_by_membership_id IS NULL) AND (superseded_at IS NULL)) OR (((state)::text = 'superseded'::text) AND (instructions IS NOT NULL) AND (outcome IS NULL) AND (completed_at IS NULL) AND (completed_by_membership_id IS NULL) AND (superseded_at IS NOT NULL)))),
    CONSTRAINT clinic_lab_follow_ups_values CHECK ((((state)::text = ANY ((ARRAY['open'::character varying, 'completed'::character varying, 'not_required'::character varying, 'superseded'::character varying])::text[])) AND ((instructions IS NULL) OR ((char_length(TRIM(BOTH FROM instructions)) >= 1) AND (char_length(TRIM(BOTH FROM instructions)) <= 1000))) AND ((outcome IS NULL) OR ((char_length(TRIM(BOTH FROM outcome)) >= 1) AND (char_length(TRIM(BOTH FROM outcome)) <= 1000)))))
);


--
-- Name: clinic_lab_result_follow_ups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_lab_result_follow_ups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_lab_result_follow_ups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_lab_result_follow_ups_id_seq OWNED BY public.clinic_lab_result_follow_ups.id;


--
-- Name: clinic_medication_administration_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_medication_administration_movements (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    medication_administration_id bigint CONSTRAINT clinic_medication_administr_medication_administration__not_null NOT NULL,
    inventory_entry_id bigint CONSTRAINT clinic_medication_administration_mo_inventory_entry_id_not_null NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    stock_snapshot text CONSTRAINT clinic_medication_administration_moveme_stock_snapshot_not_null NOT NULL
);


--
-- Name: clinic_medication_administration_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_medication_administration_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_medication_administration_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_medication_administration_movements_id_seq OWNED BY public.clinic_medication_administration_movements.id;


--
-- Name: clinic_medication_administrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_medication_administrations (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    site_id bigint NOT NULL,
    administered_by_membership_id bigint CONSTRAINT clinic_medication_administr_administered_by_membership_not_null NOT NULL,
    product_id bigint NOT NULL,
    dose_text text NOT NULL,
    route_text text NOT NULL,
    administration_site_text text,
    quantity numeric(12,6) NOT NULL,
    stock_unit character varying(20) NOT NULL,
    administered_at timestamp(6) with time zone NOT NULL,
    recorded_at timestamp(6) with time zone NOT NULL,
    request_key character varying(160) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    medication_snapshot text NOT NULL,
    CONSTRAINT clinic_medication_administrations_quantity CHECK (((quantity > (0)::numeric) AND (quantity <= (1000000)::numeric) AND (quantity = round(quantity, 6)))),
    CONSTRAINT clinic_medication_administrations_stock_unit CHECK (((stock_unit)::text = ANY ((ARRAY['package'::character varying, 'each'::character varying, 'tablet'::character varying, 'capsule'::character varying, 'vial'::character varying, 'mL'::character varying, 'g'::character varying])::text[]))),
    CONSTRAINT clinic_medication_administrations_timeline CHECK ((administered_at <= recorded_at)),
    CONSTRAINT clinic_medication_administrations_values CHECK (((length(TRIM(BOTH FROM dose_text)) > 0) AND (length(TRIM(BOTH FROM route_text)) > 0) AND ((length((request_key)::text) >= 1) AND (length((request_key)::text) <= 160))))
);


--
-- Name: clinic_medication_administrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_medication_administrations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_medication_administrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_medication_administrations_id_seq OWNED BY public.clinic_medication_administrations.id;


--
-- Name: clinic_medication_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_medication_statements (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    data_status character varying DEFAULT 'incomplete'::character varying NOT NULL,
    recorded_by_membership_id bigint,
    reviewed_by_membership_id bigint,
    recorded_at timestamp(6) with time zone,
    last_reviewed_at timestamp(6) with time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    medication_name text,
    dose_text text,
    route_text text,
    frequency_text text,
    purpose text,
    status character varying DEFAULT 'unknown'::character varying NOT NULL,
    information_source character varying DEFAULT 'unknown'::character varying NOT NULL,
    effective_from timestamp(6) with time zone,
    effective_until timestamp(6) with time zone,
    asserted_at timestamp(6) with time zone,
    CONSTRAINT clinic_medication_recorded_shape CHECK ((((data_status)::text = 'incomplete'::text) OR ((medication_name IS NOT NULL) AND (recorded_by_membership_id IS NOT NULL) AND (recorded_at IS NOT NULL)))),
    CONSTRAINT clinic_medication_statements_data_status CHECK (((data_status)::text = ANY ((ARRAY['incomplete'::character varying, 'recorded'::character varying])::text[]))),
    CONSTRAINT clinic_medication_statements_lock_version CHECK ((lock_version >= 0)),
    CONSTRAINT clinic_medication_statements_review_pair CHECK ((((last_reviewed_at IS NULL) AND (reviewed_by_membership_id IS NULL)) OR ((last_reviewed_at IS NOT NULL) AND (reviewed_by_membership_id IS NOT NULL)))),
    CONSTRAINT clinic_medication_statements_source CHECK (((information_source)::text = ANY ((ARRAY['patient'::character varying, 'caregiver'::character varying, 'clinician'::character varying, 'external_record'::character varying, 'other'::character varying, 'unknown'::character varying])::text[]))),
    CONSTRAINT clinic_medication_statements_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'on_hold'::character varying, 'stopped'::character varying, 'not_taken'::character varying, 'unknown'::character varying, 'entered_in_error'::character varying])::text[]))),
    CONSTRAINT clinic_medication_valid_window CHECK (((effective_until IS NULL) OR (effective_from IS NULL) OR (effective_until >= effective_from)))
);


--
-- Name: clinic_medication_statements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_medication_statements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_medication_statements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_medication_statements_id_seq OWNED BY public.clinic_medication_statements.id;


--
-- Name: clinic_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_memberships (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    user_id bigint NOT NULL,
    active boolean DEFAULT true NOT NULL,
    patients_access boolean DEFAULT false NOT NULL,
    inventory_access boolean DEFAULT false NOT NULL,
    staff_access boolean DEFAULT false NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    inventory_catalog boolean DEFAULT false NOT NULL,
    inventory_receive boolean DEFAULT false NOT NULL,
    inventory_adjust boolean DEFAULT false NOT NULL,
    inventory_hold boolean DEFAULT false NOT NULL,
    inventory_release boolean DEFAULT false NOT NULL,
    inventory_count boolean DEFAULT false NOT NULL,
    inventory_configure boolean DEFAULT false NOT NULL,
    inventory_transfer boolean DEFAULT false NOT NULL
);


--
-- Name: clinic_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_memberships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_memberships_id_seq OWNED BY public.clinic_memberships.id;


--
-- Name: clinic_message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_message_attachments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    message_intent_id bigint NOT NULL,
    document_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_message_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_message_attachments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_message_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_message_attachments_id_seq OWNED BY public.clinic_message_attachments.id;


--
-- Name: clinic_message_delivery_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_message_delivery_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    message_intent_id bigint NOT NULL,
    provider_event_reference character varying CONSTRAINT clinic_message_delivery_event_provider_event_reference_not_null NOT NULL,
    outcome character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_message_delivery_values CHECK (((length(TRIM(BOTH FROM provider_event_reference)) > 0) AND (length(TRIM(BOTH FROM outcome)) > 0)))
);


--
-- Name: clinic_message_delivery_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_message_delivery_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_message_delivery_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_message_delivery_events_id_seq OWNED BY public.clinic_message_delivery_events.id;


--
-- Name: clinic_message_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_message_intents (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    request_key character varying NOT NULL,
    purpose_code character varying NOT NULL,
    encrypted_recipient_snapshot text NOT NULL,
    encrypted_content text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_message_intents_values CHECK (((length(TRIM(BOTH FROM request_key)) > 0) AND (length(TRIM(BOTH FROM purpose_code)) > 0)))
);


--
-- Name: clinic_message_intents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_message_intents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_message_intents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_message_intents_id_seq OWNED BY public.clinic_message_intents.id;


--
-- Name: clinic_message_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_message_outbox (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    message_intent_id bigint NOT NULL,
    dispatch_state character varying NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_message_outbox_values CHECK (((lock_version >= 0) AND (length(TRIM(BOTH FROM dispatch_state)) > 0)))
);


--
-- Name: clinic_message_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_message_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_message_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_message_outbox_id_seq OWNED BY public.clinic_message_outbox.id;


--
-- Name: clinic_model_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_model_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    item_type character varying NOT NULL,
    item_id bigint NOT NULL,
    event character varying NOT NULL,
    whodunnit character varying,
    actor_reference character varying,
    request_id character varying,
    causal_id character varying,
    job_id character varying,
    changed_fields character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    occurred_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_model_versions_values CHECK (((length(TRIM(BOTH FROM item_type)) > 0) AND (length(TRIM(BOTH FROM event)) > 0) AND ((event)::text = ANY ((ARRAY['create'::character varying, 'update'::character varying, 'destroy'::character varying, 'touch'::character varying])::text[])) AND ((whodunnit IS NULL) OR (length(TRIM(BOTH FROM whodunnit)) > 0)) AND ((actor_reference IS NULL) OR (length(TRIM(BOTH FROM actor_reference)) > 0))))
);


--
-- Name: clinic_model_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_model_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_model_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_model_versions_id_seq OWNED BY public.clinic_model_versions.id;


--
-- Name: clinic_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_notes (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    author_id bigint NOT NULL,
    body text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_notes_id_seq OWNED BY public.clinic_notes.id;


--
-- Name: clinic_observation_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_observation_sources (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    derived_observation_id bigint NOT NULL,
    source_observation_id bigint NOT NULL,
    formula_version character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_observation_sources_values CHECK (((derived_observation_id <> source_observation_id) AND (length(TRIM(BOTH FROM formula_version)) > 0)))
);


--
-- Name: clinic_observation_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_observation_sources_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_observation_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_observation_sources_id_seq OWNED BY public.clinic_observation_sources.id;


--
-- Name: clinic_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_observations (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint,
    author_membership_id bigint NOT NULL,
    parent_observation_id bigint,
    code character varying NOT NULL,
    code_system character varying NOT NULL,
    code_version character varying NOT NULL,
    value_kind character varying NOT NULL,
    numeric_value numeric(30,10),
    text_value text,
    coded_value text,
    unit_code character varying,
    missing_reason character varying,
    observed_at timestamp(6) with time zone NOT NULL,
    recorded_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    encrypted_value text,
    value_binding_id character varying NOT NULL,
    CONSTRAINT clinic_observations_encrypted_value_shape CHECK (((((value_kind)::text = 'group'::text) AND (encrypted_value IS NULL)) OR (((value_kind)::text <> 'group'::text) AND (encrypted_value IS NOT NULL) AND (length(TRIM(BOTH FROM encrypted_value)) > 0)))),
    CONSTRAINT clinic_observations_finite_numeric CHECK (((numeric_value IS NULL) OR (numeric_value <> 'NaN'::numeric))),
    CONSTRAINT clinic_observations_legacy_values_empty CHECK (((numeric_value IS NULL) AND (text_value IS NULL) AND (coded_value IS NULL) AND (unit_code IS NULL) AND (missing_reason IS NULL))),
    CONSTRAINT clinic_observations_value_binding_format CHECK (((value_binding_id)::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'::text)),
    CONSTRAINT clinic_observations_value_kind CHECK (((value_kind)::text = ANY ((ARRAY['numeric'::character varying, 'text'::character varying, 'coded'::character varying, 'missing'::character varying, 'group'::character varying])::text[])))
);


--
-- Name: clinic_observations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_observations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_observations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_observations_id_seq OWNED BY public.clinic_observations.id;


--
-- Name: clinic_operation_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_operation_receipts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    actor_membership_id bigint NOT NULL,
    operation_code character varying NOT NULL,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    outcome character varying NOT NULL,
    resource_type character varying,
    resource_id bigint,
    resource_version character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    digest_algorithm character varying NOT NULL,
    digest_key_id character varying,
    CONSTRAINT clinic_operation_receipts_digest_algorithm CHECK (((digest_algorithm)::text = ANY ((ARRAY['sha256-v0'::character varying, 'hmac-sha256-v1'::character varying])::text[]))),
    CONSTRAINT clinic_operation_receipts_digest_key CHECK (((((digest_algorithm)::text = 'sha256-v0'::text) AND (digest_key_id IS NULL)) OR (((digest_algorithm)::text = 'hmac-sha256-v1'::text) AND (digest_key_id IS NOT NULL) AND (length(TRIM(BOTH FROM digest_key_id)) > 0)))),
    CONSTRAINT clinic_operation_receipts_resource_pair CHECK ((((resource_type IS NULL) AND (resource_id IS NULL)) OR ((resource_type IS NOT NULL) AND (resource_id IS NOT NULL)))),
    CONSTRAINT clinic_operation_receipts_values CHECK (((length(TRIM(BOTH FROM operation_code)) > 0) AND (length(TRIM(BOTH FROM request_key)) > 0) AND ((payload_digest)::text ~ '^[0-9a-f]{64}$'::text) AND ((outcome)::text = ANY ((ARRAY['committed'::character varying, 'outcome_unconfirmed'::character varying])::text[])) AND ((resource_id IS NULL) OR (resource_id > 0))))
);


--
-- Name: clinic_operation_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_operation_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_operation_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_operation_receipts_id_seq OWNED BY public.clinic_operation_receipts.id;


--
-- Name: clinic_patient_address_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_address_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    version integer NOT NULL,
    encrypted_address text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_addresses_version_positive CHECK ((version > 0))
);


--
-- Name: clinic_patient_address_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_address_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_address_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_address_versions_id_seq OWNED BY public.clinic_patient_address_versions.id;


--
-- Name: clinic_patient_care_needs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_care_needs (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    category character varying NOT NULL,
    need_code character varying NOT NULL,
    description text NOT NULL,
    instructions text,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    effective_from timestamp(6) with time zone NOT NULL,
    effective_until timestamp(6) with time zone,
    recorded_by_membership_id bigint NOT NULL,
    recorded_at timestamp(6) with time zone NOT NULL,
    reviewed_by_membership_id bigint,
    last_reviewed_at timestamp(6) with time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_care_needs_category CHECK (((category)::text = ANY ((ARRAY['communication'::character varying, 'accessibility'::character varying, 'mobility'::character varying, 'equipment'::character varying, 'decision_support'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT clinic_care_needs_code CHECK (((need_code)::text = ANY ((ARRAY['spoken_language_interpreter'::character varying, 'sign_language_interpreter'::character varying, 'hearing_assistance'::character varying, 'vision_assistance'::character varying, 'communication_device'::character varying, 'wheelchair_access'::character varying, 'transfer_assistance'::character varying, 'mobility_assistance'::character varying, 'service_animal'::character varying, 'support_person'::character varying, 'cognitive_support'::character varying, 'supplemental_oxygen'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT clinic_care_needs_lock_version CHECK ((lock_version >= 0)),
    CONSTRAINT clinic_care_needs_review_pair CHECK ((((last_reviewed_at IS NULL) AND (reviewed_by_membership_id IS NULL)) OR ((last_reviewed_at IS NOT NULL) AND (reviewed_by_membership_id IS NOT NULL)))),
    CONSTRAINT clinic_care_needs_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'entered_in_error'::character varying])::text[]))),
    CONSTRAINT clinic_care_needs_valid_window CHECK (((effective_until IS NULL) OR (effective_until > effective_from)))
);


--
-- Name: clinic_patient_care_needs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_care_needs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_care_needs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_care_needs_id_seq OWNED BY public.clinic_patient_care_needs.id;


--
-- Name: clinic_patient_communication_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_communication_preferences (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    preferred_contact_method character varying CONSTRAINT clinic_patient_communication__preferred_contact_method_not_null NOT NULL,
    appointment_reminders_consent boolean DEFAULT false CONSTRAINT clinic_patient_communicatio_appointment_reminders_cons_not_null NOT NULL,
    general_communications_consent boolean DEFAULT false CONSTRAINT clinic_patient_communicatio_general_communications_con_not_null NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_communication_preferences_method CHECK (((preferred_contact_method)::text = ANY ((ARRAY['text'::character varying, 'phone'::character varying, 'email'::character varying, 'portal'::character varying])::text[])))
);


--
-- Name: clinic_patient_communication_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_communication_preferences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_communication_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_communication_preferences_id_seq OWNED BY public.clinic_patient_communication_preferences.id;


--
-- Name: clinic_patient_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_contacts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    contact_type character varying NOT NULL,
    contact_value text NOT NULL,
    preferred boolean DEFAULT false NOT NULL,
    effective_from timestamp(6) with time zone NOT NULL,
    effective_until timestamp(6) with time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_contacts_type CHECK (((contact_type)::text = ANY ((ARRAY['phone'::character varying, 'email'::character varying])::text[]))),
    CONSTRAINT clinic_patient_contacts_window CHECK (((effective_until IS NULL) OR (effective_until > effective_from)))
);


--
-- Name: clinic_patient_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_contacts_id_seq OWNED BY public.clinic_patient_contacts.id;


--
-- Name: clinic_patient_demographics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_demographics (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    date_of_birth date,
    sex character varying NOT NULL,
    primary_language character varying NOT NULL,
    interpreter_required boolean DEFAULT false NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_demographics_language_present CHECK ((length(TRIM(BOTH FROM primary_language)) > 0))
);


--
-- Name: clinic_patient_demographics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_demographics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_demographics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_demographics_id_seq OWNED BY public.clinic_patient_demographics.id;


--
-- Name: clinic_patient_emergency_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_emergency_contacts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    name text NOT NULL,
    relationship character varying NOT NULL,
    phone text NOT NULL,
    permission_to_contact boolean DEFAULT false CONSTRAINT clinic_patient_emergency_contact_permission_to_contact_not_null NOT NULL,
    effective_from timestamp(6) with time zone NOT NULL,
    effective_until timestamp(6) with time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_emergency_contacts_window CHECK (((effective_until IS NULL) OR (effective_until > effective_from)))
);


--
-- Name: clinic_patient_emergency_contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_emergency_contacts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_emergency_contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_emergency_contacts_id_seq OWNED BY public.clinic_patient_emergency_contacts.id;


--
-- Name: clinic_patient_history_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_history_reviews (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    topic character varying NOT NULL,
    outcome character varying NOT NULL,
    information_source character varying NOT NULL,
    notes text,
    reviewer_membership_id bigint NOT NULL,
    reviewed_at timestamp(6) with time zone NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_history_reviews_outcome CHECK (((outcome)::text = ANY ((ARRAY['current_list_confirmed'::character varying, 'none_reported'::character varying, 'follow_up_needed'::character varying, 'unable_to_obtain'::character varying])::text[]))),
    CONSTRAINT clinic_history_reviews_request_present CHECK ((length(TRIM(BOTH FROM request_key)) > 0)),
    CONSTRAINT clinic_history_reviews_source CHECK (((information_source)::text = ANY ((ARRAY['patient'::character varying, 'caregiver'::character varying, 'clinician'::character varying, 'external_record'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT clinic_history_reviews_topic CHECK (((topic)::text = ANY ((ARRAY['allergies'::character varying, 'medications'::character varying, 'care_needs'::character varying])::text[])))
);


--
-- Name: clinic_patient_history_reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_history_reviews_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_history_reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_history_reviews_id_seq OWNED BY public.clinic_patient_history_reviews.id;


--
-- Name: clinic_patient_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_memberships (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    recorded_by_membership_id bigint NOT NULL,
    status character varying NOT NULL,
    version integer NOT NULL,
    effective_from timestamp(6) without time zone NOT NULL,
    effective_until timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_memberships_status CHECK (((status)::text = ANY ((ARRAY['member'::character varying, 'nonmember'::character varying])::text[]))),
    CONSTRAINT clinic_patient_memberships_window CHECK (((version > 0) AND ((effective_until IS NULL) OR (effective_until > effective_from))))
);


--
-- Name: clinic_patient_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_memberships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_memberships_id_seq OWNED BY public.clinic_patient_memberships.id;


--
-- Name: clinic_patient_portal_appointment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_portal_appointment_requests (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    identity_id bigint NOT NULL,
    request_key character varying NOT NULL,
    starts_at timestamp(6) without time zone,
    ends_at timestamp(6) without time zone,
    site_id bigint,
    visit_type_id bigint,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    requested_at timestamp(6) without time zone CONSTRAINT clinic_patient_portal_appointment_request_requested_at_not_null NOT NULL,
    reviewed_at timestamp(6) without time zone,
    review_note text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    appointment_id bigint,
    reviewed_by_membership_id bigint,
    request_kind character varying DEFAULT 'new_booking'::character varying CONSTRAINT clinic_patient_portal_appointment_request_request_kind_not_null NOT NULL,
    source_appointment_id bigint,
    source_appointment_updated_at timestamp(6) without time zone,
    source_starts_at timestamp(6) without time zone,
    source_ends_at timestamp(6) without time zone,
    source_site_id bigint,
    source_status character varying,
    requested_modality character varying(16),
    CONSTRAINT clinic_patient_portal_appointment_requests_values CHECK ((((request_kind)::text = ANY ((ARRAY['new_booking'::character varying, 'reschedule'::character varying, 'cancel'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'declined'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[])) AND ((((request_kind)::text = 'new_booking'::text) AND (source_appointment_id IS NULL) AND (source_appointment_updated_at IS NULL) AND (source_starts_at IS NULL) AND (source_ends_at IS NULL) AND (source_site_id IS NULL) AND (source_status IS NULL) AND (starts_at IS NOT NULL) AND (ends_at > starts_at)) OR (((request_kind)::text = 'reschedule'::text) AND (source_appointment_id IS NOT NULL) AND (source_appointment_updated_at IS NOT NULL) AND (source_starts_at IS NOT NULL) AND (source_ends_at > source_starts_at) AND ((source_status)::text = ANY ((ARRAY['scheduled'::character varying, 'confirmed'::character varying])::text[])) AND (site_id IS NULL) AND (visit_type_id IS NULL) AND (starts_at IS NOT NULL) AND (ends_at > starts_at)) OR (((request_kind)::text = 'cancel'::text) AND (source_appointment_id IS NOT NULL) AND (source_appointment_updated_at IS NOT NULL) AND (source_starts_at IS NOT NULL) AND (source_ends_at > source_starts_at) AND ((source_status)::text = ANY ((ARRAY['scheduled'::character varying, 'confirmed'::character varying])::text[])) AND (starts_at IS NULL) AND (ends_at IS NULL) AND (site_id IS NULL) AND (visit_type_id IS NULL))))),
    CONSTRAINT clinic_portal_requests_modality CHECK (((requested_modality IS NULL) OR ((requested_modality)::text = ANY ((ARRAY['in_person'::character varying, 'video'::character varying])::text[]))))
);


--
-- Name: clinic_patient_portal_appointment_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_portal_appointment_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_portal_appointment_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_portal_appointment_requests_id_seq OWNED BY public.clinic_patient_portal_appointment_requests.id;


--
-- Name: clinic_patient_portal_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_portal_identities (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    user_id bigint NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    invited_at timestamp(6) without time zone NOT NULL,
    activated_at timestamp(6) without time zone,
    revoked_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    invitation_digest character varying,
    invitation_expires_at timestamp(6) without time zone,
    accepted_terms_version character varying,
    accepted_terms_at timestamp(6) without time zone,
    revoked_reason character varying,
    last_step_up_at timestamp(6) without time zone,
    CONSTRAINT clinic_patient_portal_identity_invitation_state CHECK ((((status)::text <> 'invited'::text) OR ((invitation_digest IS NOT NULL) AND (invitation_expires_at IS NOT NULL)))),
    CONSTRAINT clinic_patient_portal_identity_status CHECK (((status)::text = ANY ((ARRAY['invited'::character varying, 'active'::character varying, 'revoked'::character varying])::text[])))
);


--
-- Name: clinic_patient_portal_identities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_portal_identities_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_portal_identities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_portal_identities_id_seq OWNED BY public.clinic_patient_portal_identities.id;


--
-- Name: clinic_patient_portal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_portal_requests (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    identity_id bigint NOT NULL,
    request_key character varying NOT NULL,
    request_type character varying NOT NULL,
    content text NOT NULL,
    content_digest character varying NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    requested_at timestamp(6) without time zone NOT NULL,
    reviewed_at timestamp(6) without time zone,
    review_note character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_portal_requests_values CHECK ((((request_type)::text = ANY ((ARRAY['message'::character varying, 'refill'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['pending'::character varying, 'in_review'::character varying, 'resolved'::character varying, 'declined'::character varying])::text[])) AND (length(TRIM(BOTH FROM content_digest)) > 0)))
);


--
-- Name: clinic_patient_portal_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_portal_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_portal_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_portal_requests_id_seq OWNED BY public.clinic_patient_portal_requests.id;


--
-- Name: clinic_patient_reminder_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_reminder_actions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    reminder_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    request_key character varying NOT NULL,
    action_type character varying NOT NULL,
    outcome character varying DEFAULT 'recorded'::character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_reminder_actions_values CHECK ((((action_type)::text = ANY ((ARRAY['confirm'::character varying, 'request_reschedule'::character varying, 'request_help'::character varying, 'dismiss'::character varying])::text[])) AND (length(TRIM(BOTH FROM request_key)) > 0)))
);


--
-- Name: clinic_patient_reminder_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_reminder_actions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_reminder_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_reminder_actions_id_seq OWNED BY public.clinic_patient_reminder_actions.id;


--
-- Name: clinic_patient_reminder_delivery_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_reminder_delivery_attempts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    reminder_id bigint NOT NULL,
    attempt_number integer CONSTRAINT clinic_patient_reminder_delivery_attemp_attempt_number_not_null NOT NULL,
    provider character varying DEFAULT 'synthetic'::character varying NOT NULL,
    idempotency_key character varying CONSTRAINT clinic_patient_reminder_delivery_attem_idempotency_key_not_null NOT NULL,
    status character varying NOT NULL,
    failure_class character varying,
    retryable boolean DEFAULT false NOT NULL,
    provider_message_id character varying,
    masked_destination character varying CONSTRAINT clinic_patient_reminder_delivery_at_masked_destination_not_null NOT NULL,
    queued_at timestamp(6) without time zone NOT NULL,
    accepted_at timestamp(6) without time zone,
    completed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_patient_reminder_delivery_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_reminder_delivery_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_reminder_delivery_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_reminder_delivery_attempts_id_seq OWNED BY public.clinic_patient_reminder_delivery_attempts.id;


--
-- Name: clinic_patient_reminder_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_reminder_outbox (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    reminder_id bigint NOT NULL,
    dispatch_state character varying DEFAULT 'pending'::character varying NOT NULL,
    idempotency_key character varying NOT NULL,
    available_at timestamp(6) without time zone NOT NULL,
    lease_until timestamp(6) without time zone,
    provider_message_id character varying,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_patient_reminder_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_reminder_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_reminder_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_reminder_outbox_id_seq OWNED BY public.clinic_patient_reminder_outbox.id;


--
-- Name: clinic_patient_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_reminders (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    communication_endpoint_id bigint NOT NULL,
    source_type character varying NOT NULL,
    source_id bigint NOT NULL,
    source_version character varying,
    category character varying NOT NULL,
    channel character varying NOT NULL,
    safe_content_version character varying DEFAULT 'appointment-v1'::character varying NOT NULL,
    safe_preview text NOT NULL,
    scheduled_at timestamp(6) without time zone NOT NULL,
    timezone character varying NOT NULL,
    local_schedule_label character varying NOT NULL,
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    priority character varying DEFAULT 'normal'::character varying NOT NULL,
    dedupe_key character varying NOT NULL,
    expires_at timestamp(6) without time zone,
    cancelled_at timestamp(6) without time zone,
    cancel_reason character varying,
    policy_decision_code character varying,
    policy_version character varying,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    content text NOT NULL,
    CONSTRAINT clinic_patient_reminders_values CHECK ((((category)::text = ANY ((ARRAY['appointment'::character varying, 'preparation'::character varying, 'medication'::character varying, 'follow_up'::character varying])::text[])) AND ((channel)::text = ANY ((ARRAY['portal'::character varying, 'sms'::character varying, 'email'::character varying])::text[])) AND (length(TRIM(BOTH FROM dedupe_key)) > 0) AND (lock_version >= 0)))
);


--
-- Name: clinic_patient_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_reminders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_reminders_id_seq OWNED BY public.clinic_patient_reminders.id;


--
-- Name: clinic_patient_social_histories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patient_social_histories (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    tobacco_use text,
    alcohol_use text,
    exercise_habits text,
    diet text,
    occupation text,
    living_situation text,
    relevant_social_factors text,
    effective_from timestamp(6) with time zone NOT NULL,
    effective_until timestamp(6) with time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_social_histories_window CHECK (((effective_until IS NULL) OR (effective_until > effective_from)))
);


--
-- Name: clinic_patient_social_histories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patient_social_histories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patient_social_histories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patient_social_histories_id_seq OWNED BY public.clinic_patient_social_histories.id;


--
-- Name: clinic_patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patients (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    display_name text NOT NULL,
    reference character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    primary_address_version_id bigint,
    name_search_tokens text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: clinic_patients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_patients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_patients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_patients_id_seq OWNED BY public.clinic_patients.id;


--
-- Name: clinic_payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_payment_allocations (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    payment_event_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    amount numeric(20,6) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_payment_allocations_amount CHECK (((amount > (0)::numeric) AND (amount = round(amount, 2))))
);


--
-- Name: clinic_payment_allocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_payment_allocations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_payment_allocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_payment_allocations_id_seq OWNED BY public.clinic_payment_allocations.id;


--
-- Name: clinic_payment_collection_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_payment_collection_intents (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    reference character varying NOT NULL,
    request_key character varying NOT NULL,
    processor character varying NOT NULL,
    mode character varying DEFAULT 'test'::character varying NOT NULL,
    currency character varying NOT NULL,
    amount numeric(20,6) NOT NULL,
    state character varying DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT payment_collection_intents_values CHECK ((((reference)::text ~ '^ci_[a-f0-9]{32}$'::text) AND ((request_key)::text ~ '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$'::text) AND ((processor)::text ~ '^[a-z][a-z0-9_.-]{0,39}$'::text) AND ((mode)::text = ANY ((ARRAY['test'::character varying, 'live'::character varying])::text[])) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND (amount > (0)::numeric) AND (amount = round(amount, 2)) AND ((state)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'needs_reconciliation'::character varying, 'canceled'::character varying])::text[]))))
);


--
-- Name: clinic_payment_collection_intents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_payment_collection_intents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_payment_collection_intents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_payment_collection_intents_id_seq OWNED BY public.clinic_payment_collection_intents.id;


--
-- Name: clinic_payment_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_payment_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    currency character varying NOT NULL,
    amount numeric(20,6) NOT NULL,
    external_event_reference character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_payment_events_values CHECK ((((currency)::text ~ '^[A-Z]{3}$'::text) AND (amount > (0)::numeric) AND (length(TRIM(BOTH FROM external_event_reference)) > 0)))
);


--
-- Name: clinic_payment_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_payment_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_payment_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_payment_events_id_seq OWNED BY public.clinic_payment_events.id;


--
-- Name: clinic_payment_processor_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_payment_processor_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint,
    payment_collection_intent_id bigint,
    processor character varying NOT NULL,
    processor_event_reference character varying CONSTRAINT clinic_payment_processor_eve_processor_event_reference_not_null NOT NULL,
    processor_intent_reference character varying,
    event_type character varying NOT NULL,
    payload_version character varying,
    raw_payload_digest character varying NOT NULL,
    normalized_outcome character varying NOT NULL,
    processing_state character varying NOT NULL,
    verified_at timestamp(6) without time zone NOT NULL,
    redacted_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT payment_processor_events_values CHECK ((((processor)::text ~ '^[a-z][a-z0-9_.-]{0,39}$'::text) AND (length(TRIM(BOTH FROM processor_event_reference)) > 0) AND (length(TRIM(BOTH FROM event_type)) > 0) AND ((raw_payload_digest)::text ~ '^[0-9a-f]{64}$'::text) AND ((normalized_outcome)::text = ANY ((ARRAY['succeeded'::character varying, 'failed'::character varying, 'processing'::character varying, 'canceled'::character varying, 'unknown'::character varying])::text[])) AND ((processing_state)::text = ANY ((ARRAY['received'::character varying, 'signature_verified'::character varying, 'normalized'::character varying, 'applied'::character varying, 'ignored_duplicate'::character varying, 'rejected'::character varying, 'needs_reconciliation'::character varying])::text[])) AND (redacted_payload IS NOT NULL)))
);


--
-- Name: clinic_payment_processor_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_payment_processor_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_payment_processor_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_payment_processor_events_id_seq OWNED BY public.clinic_payment_processor_events.id;


--
-- Name: clinic_pharmacy_batch_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_pharmacy_batch_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    from_status character varying NOT NULL,
    to_status character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_pharmacy_batch_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_pharmacy_batch_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_pharmacy_batch_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_pharmacy_batch_events_id_seq OWNED BY public.clinic_pharmacy_batch_events.id;


--
-- Name: clinic_pharmacy_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_pharmacy_batches (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    product_id bigint NOT NULL,
    lot_number character varying NOT NULL,
    location character varying NOT NULL,
    supplier character varying,
    expires_on date NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    lot_id bigint NOT NULL,
    location_id bigint NOT NULL,
    on_hand numeric DEFAULT 0.0 NOT NULL,
    CONSTRAINT inventory_position_balance CHECK (((on_hand >= (0)::numeric) AND (on_hand <= (1000000)::numeric))),
    CONSTRAINT pharmacy_batch_status CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'quarantined'::character varying, 'recalled'::character varying])::text[])))
);


--
-- Name: clinic_pharmacy_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_pharmacy_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_pharmacy_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_pharmacy_batches_id_seq OWNED BY public.clinic_pharmacy_batches.id;


--
-- Name: clinic_pharmacy_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_pharmacy_movements (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    quantity integer NOT NULL,
    kind character varying NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT pharmacy_movement_direction CHECK (((((kind)::text = ANY ((ARRAY['receipt'::character varying, 'adjustment_in'::character varying])::text[])) AND (quantity > 0)) OR (((kind)::text = ANY ((ARRAY['adjustment_out'::character varying, 'damaged'::character varying, 'expired'::character varying, 'return_to_supplier'::character varying])::text[])) AND (quantity < 0)))),
    CONSTRAINT pharmacy_movement_range CHECK (((quantity <> 0) AND ((quantity >= '-1000000'::integer) AND (quantity <= 1000000))))
);


--
-- Name: clinic_pharmacy_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_pharmacy_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_pharmacy_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_pharmacy_movements_id_seq OWNED BY public.clinic_pharmacy_movements.id;


--
-- Name: clinic_pharmacy_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_pharmacy_products (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    name character varying NOT NULL,
    generic_name character varying,
    ndc character varying,
    product_ndc character varying,
    dosage_form character varying,
    route character varying,
    labeler character varying,
    ingredients text,
    package_description text,
    sku character varying NOT NULL,
    reorder_point integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    source character varying DEFAULT 'manual'::character varying NOT NULL,
    imported_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    stock_unit character varying DEFAULT 'package'::character varying NOT NULL,
    quantity_scale integer DEFAULT 0 NOT NULL,
    package_size numeric DEFAULT 1.0 NOT NULL,
    unit_reference character varying,
    dea_schedule character varying,
    category character varying DEFAULT 'medication'::character varying NOT NULL,
    device_identifier character varying,
    preferred_supplier_id bigint,
    CONSTRAINT inventory_package_unit CHECK ((((stock_unit)::text <> 'package'::text) OR (package_size = (1)::numeric))),
    CONSTRAINT inventory_product_units CHECK ((((stock_unit)::text = ANY ((ARRAY['package'::character varying, 'each'::character varying, 'tablet'::character varying, 'capsule'::character varying, 'vial'::character varying, 'mL'::character varying, 'g'::character varying])::text[])) AND ((quantity_scale >= 0) AND (quantity_scale <= 6)) AND (((stock_unit)::text = ANY ((ARRAY['mL'::character varying, 'g'::character varying])::text[])) OR (quantity_scale = 0)) AND (package_size > (0)::numeric) AND (package_size <= (1000000)::numeric) AND (package_size = round(package_size, quantity_scale)) AND ((package_size = (1)::numeric) OR (length(TRIM(BOTH FROM unit_reference)) > 0)))),
    CONSTRAINT inventory_unit_evidence CHECK (((package_size = (1)::numeric) OR ((unit_reference IS NOT NULL) AND (length(TRIM(BOTH FROM unit_reference)) > 0)))),
    CONSTRAINT pharmacy_product_category CHECK (((category)::text = ANY ((ARRAY['medication'::character varying, 'clinical_supply'::character varying, 'lab_supply'::character varying, 'office_supply'::character varying, 'cleaning_supply'::character varying, 'equipment'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT pharmacy_product_dea_schedule CHECK (((dea_schedule IS NULL) OR ((dea_schedule)::text = ANY ((ARRAY['II'::character varying, 'III'::character varying, 'IV'::character varying, 'V'::character varying])::text[])))),
    CONSTRAINT pharmacy_product_source CHECK (((source)::text = ANY ((ARRAY['manual'::character varying, 'openfda'::character varying, 'gudid'::character varying, 'synthetic'::character varying])::text[]))),
    CONSTRAINT pharmacy_reorder_range CHECK (((reorder_point >= 0) AND (reorder_point <= 1000000)))
);


--
-- Name: clinic_pharmacy_products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_pharmacy_products_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_pharmacy_products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_pharmacy_products_id_seq OWNED BY public.clinic_pharmacy_products.id;


--
-- Name: clinic_practices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_practices (
    id bigint NOT NULL,
    name character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    timezone character varying DEFAULT 'UTC'::character varying NOT NULL,
    organization_id bigint
);


--
-- Name: clinic_practices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_practices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_practices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_practices_id_seq OWNED BY public.clinic_practices.id;


--
-- Name: clinic_previsit_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_previsit_notes (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    appointment_id bigint NOT NULL,
    version_number integer NOT NULL,
    encrypted_text text NOT NULL,
    submitted_by_user_id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    submitted_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_previsit_notes_values CHECK (((version_number > 0) AND ((length((request_key)::text) >= 1) AND (length((request_key)::text) <= 160))))
);


--
-- Name: clinic_previsit_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_previsit_notes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_previsit_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_previsit_notes_id_seq OWNED BY public.clinic_previsit_notes.id;


--
-- Name: clinic_refund_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_refund_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    payment_event_id bigint NOT NULL,
    currency character varying NOT NULL,
    amount numeric(20,6) NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    reason character varying NOT NULL,
    CONSTRAINT clinic_refund_events_reason_length CHECK (((char_length((reason)::text) >= 1) AND (char_length((reason)::text) <= 200))),
    CONSTRAINT clinic_refund_events_values CHECK ((((currency)::text ~ '^[A-Z]{3}$'::text) AND (amount > (0)::numeric) AND (amount = round(amount, 2))))
);


--
-- Name: clinic_refund_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_refund_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_refund_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_refund_events_id_seq OWNED BY public.clinic_refund_events.id;


--
-- Name: clinic_role_grant_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_role_grant_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    grant_id bigint NOT NULL,
    grantor_membership_id bigint NOT NULL,
    grant_revision integer NOT NULL,
    event_kind character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_role_grant_events_values CHECK (((grant_revision > 0) AND (length(TRIM(BOTH FROM event_kind)) > 0)))
);


--
-- Name: clinic_role_grant_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_role_grant_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_role_grant_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_role_grant_events_id_seq OWNED BY public.clinic_role_grant_events.id;


--
-- Name: clinic_role_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_role_grants (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    membership_id bigint NOT NULL,
    role_version_id bigint NOT NULL,
    scope_kind character varying NOT NULL,
    site_id bigint,
    revision integer DEFAULT 1 NOT NULL,
    effective_from timestamp(6) with time zone NOT NULL,
    effective_until timestamp(6) with time zone,
    revoked_at timestamp(6) with time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_role_grants_scope CHECK (((((scope_kind)::text = 'practice'::text) AND (site_id IS NULL)) OR (((scope_kind)::text = 'site'::text) AND (site_id IS NOT NULL)))),
    CONSTRAINT clinic_role_grants_window CHECK (((revision > 0) AND ((effective_until IS NULL) OR (effective_until > effective_from))))
);


--
-- Name: clinic_role_grants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_role_grants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_role_grants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_role_grants_id_seq OWNED BY public.clinic_role_grants.id;


--
-- Name: clinic_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_rooms (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    code character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_rooms_code_present CHECK ((length(TRIM(BOTH FROM code)) > 0))
);


--
-- Name: clinic_rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_rooms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_rooms_id_seq OWNED BY public.clinic_rooms.id;


--
-- Name: clinic_scribe_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_documents (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    created_by_id bigint NOT NULL,
    template_id character varying NOT NULL,
    template_version integer NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    current_draft_id bigint,
    CONSTRAINT scribe_documents_values CHECK (((template_version > 0) AND ((status)::text = ANY ((ARRAY['active'::character varying, 'deleted'::character varying])::text[]))))
);


--
-- Name: clinic_scribe_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_documents_id_seq OWNED BY public.clinic_scribe_documents.id;


--
-- Name: clinic_scribe_draft_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_draft_sections (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    draft_id bigint NOT NULL,
    section_key character varying NOT NULL,
    generated_content text,
    human_content text,
    status character varying DEFAULT 'needs_review'::character varying NOT NULL,
    warning_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    evidence_segment_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    edit_revision integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT scribe_draft_sections_values CHECK ((((section_key)::text = ANY ((ARRAY['subjective'::character varying, 'objective'::character varying, 'assessment'::character varying, 'plan'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['needs_review'::character varying, 'accepted'::character varying, 'edited'::character varying, 'rejected'::character varying])::text[])) AND (edit_revision >= 0)))
);


--
-- Name: clinic_scribe_draft_sections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_draft_sections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_draft_sections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_draft_sections_id_seq OWNED BY public.clinic_scribe_draft_sections.id;


--
-- Name: clinic_scribe_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_drafts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    source_id bigint,
    parent_id bigint,
    created_by_id bigint NOT NULL,
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    template_id character varying NOT NULL,
    template_version integer NOT NULL,
    provider character varying NOT NULL,
    model character varying NOT NULL,
    model_version character varying NOT NULL,
    prompt_digest character varying NOT NULL,
    input_digest character varying NOT NULL,
    output_digest character varying NOT NULL,
    warnings jsonb DEFAULT '[]'::jsonb NOT NULL,
    approved_by_id bigint,
    approved_at timestamp(6) without time zone,
    export_state character varying DEFAULT 'not_exported'::character varying NOT NULL,
    deleted_at timestamp(6) without time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    document_id bigint NOT NULL,
    revision_number integer NOT NULL,
    source_snapshot_digest character varying,
    context_snapshot_digest character varying,
    input_sources jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT scribe_drafts_state CHECK ((((status)::text = ANY ((ARRAY['draft'::character varying, 'in_review'::character varying, 'approved'::character varying, 'superseded'::character varying, 'exported'::character varying, 'deleted'::character varying])::text[])) AND ((export_state)::text = ANY ((ARRAY['not_exported'::character varying, 'exported'::character varying])::text[])) AND (template_version > 0)))
);


--
-- Name: clinic_scribe_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_drafts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_drafts_id_seq OWNED BY public.clinic_scribe_drafts.id;


--
-- Name: clinic_scribe_encounters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_encounters (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    site_id bigint,
    created_by_id bigint NOT NULL,
    status character varying DEFAULT 'awaiting_consent'::character varying NOT NULL,
    consent_status character varying DEFAULT 'not_recorded'::character varying NOT NULL,
    consent_policy_version character varying,
    consent_method character varying,
    consented_at timestamp(6) without time zone,
    consent_withdrawn_at timestamp(6) without time zone,
    retention_class character varying DEFAULT 'standard'::character varying NOT NULL,
    retention_expires_at timestamp(6) without time zone,
    deleted_at timestamp(6) without time zone,
    template_id character varying DEFAULT 'documentation-summary'::character varying NOT NULL,
    template_version integer DEFAULT 1 NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    context_content text,
    context_digest character varying,
    context_source_type character varying,
    context_authored_by_id bigint,
    context_updated_at timestamp(6) without time zone,
    clinical_encounter_id bigint,
    CONSTRAINT scribe_encounters_context_digest CHECK (((context_digest IS NULL) OR (length(TRIM(BOTH FROM context_digest)) = 64))),
    CONSTRAINT scribe_encounters_context_source CHECK (((context_source_type IS NULL) OR ((context_source_type)::text = 'reviewer_authored'::text))),
    CONSTRAINT scribe_encounters_state CHECK ((((status)::text = ANY ((ARRAY['awaiting_consent'::character varying, 'consented'::character varying, 'source_ready'::character varying, 'in_review'::character varying, 'approved'::character varying, 'exported'::character varying, 'consent_declined'::character varying, 'consent_withdrawn'::character varying, 'deleted'::character varying])::text[])) AND ((consent_status)::text = ANY ((ARRAY['not_recorded'::character varying, 'accepted'::character varying, 'declined'::character varying, 'withdrawn'::character varying])::text[])) AND (template_version > 0)))
);


--
-- Name: clinic_scribe_encounters_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_encounters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_encounters_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_encounters_id_seq OWNED BY public.clinic_scribe_encounters.id;


--
-- Name: clinic_scribe_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    draft_id bigint,
    actor_id bigint NOT NULL,
    event_type character varying NOT NULL,
    resource_type character varying NOT NULL,
    resource_id bigint NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_scribe_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_events_id_seq OWNED BY public.clinic_scribe_events.id;


--
-- Name: clinic_scribe_exports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_exports (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    draft_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    destination character varying NOT NULL,
    version_checksum character varying NOT NULL,
    idempotency_key character varying NOT NULL,
    status character varying DEFAULT 'exported'::character varying NOT NULL,
    payload_digest character varying NOT NULL,
    exported_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    encounter_note_id bigint,
    encounter_note_revision_id bigint,
    CONSTRAINT scribe_exports_chart_links_together CHECK (((encounter_note_id IS NULL) = (encounter_note_revision_id IS NULL))),
    CONSTRAINT scribe_exports_values CHECK ((((destination)::text = 'parent_record_adapter'::text) AND ((status)::text = ANY ((ARRAY['exported'::character varying, 'failed'::character varying])::text[]))))
);


--
-- Name: clinic_scribe_exports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_exports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_exports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_exports_id_seq OWNED BY public.clinic_scribe_exports.id;


--
-- Name: clinic_scribe_lab_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_lab_selections (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    lab_report_version_id bigint NOT NULL,
    selected_by_id bigint NOT NULL,
    selected_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_scribe_lab_selections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_lab_selections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_lab_selections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_lab_selections_id_seq OWNED BY public.clinic_scribe_lab_selections.id;


--
-- Name: clinic_scribe_note_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_note_templates (
    id bigint NOT NULL,
    template_id character varying NOT NULL,
    version integer NOT NULL,
    label character varying NOT NULL,
    note_kind character varying DEFAULT 'soap'::character varying NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    disabled_reason character varying,
    sections jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT scribe_note_templates_values CHECK (((version > 0) AND ((note_kind)::text = 'soap'::text) AND ((status)::text = ANY ((ARRAY['active'::character varying, 'disabled'::character varying, 'legacy'::character varying])::text[]))))
);


--
-- Name: clinic_scribe_note_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_note_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_note_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_note_templates_id_seq OWNED BY public.clinic_scribe_note_templates.id;


--
-- Name: clinic_scribe_recording_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_recording_chunks (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    recording_id bigint NOT NULL,
    sequence integer NOT NULL,
    status character varying DEFAULT 'acknowledged'::character varying NOT NULL,
    content text,
    content_digest character varying NOT NULL,
    byte_size integer NOT NULL,
    acknowledged_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT scribe_recording_chunks_values CHECK (((sequence >= 0) AND (byte_size > 0) AND (length(TRIM(BOTH FROM content_digest)) = 64) AND ((((status)::text = 'acknowledged'::text) AND (content IS NOT NULL)) OR (((status)::text = 'scrubbed'::text) AND (content IS NULL)))))
);


--
-- Name: clinic_scribe_recording_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_recording_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_recording_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_recording_chunks_id_seq OWNED BY public.clinic_scribe_recording_chunks.id;


--
-- Name: clinic_scribe_recordings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_recordings (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    created_by_id bigint NOT NULL,
    idempotency_key character varying NOT NULL,
    request_digest character varying NOT NULL,
    status character varying DEFAULT 'recording'::character varying NOT NULL,
    mime_type character varying NOT NULL,
    consent_policy_version character varying NOT NULL,
    consented_at timestamp(6) without time zone NOT NULL,
    expected_encounter_version integer NOT NULL,
    total_bytes bigint DEFAULT 0 NOT NULL,
    total_chunks integer,
    duration_ms bigint,
    completed_at timestamp(6) without time zone,
    interrupted_at timestamp(6) without time zone,
    cancelled_at timestamp(6) without time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    telehealth_visit_id bigint,
    capture_owner_participant_id bigint,
    capture_epoch integer,
    capture_source character varying(24) DEFAULT 'microphone'::character varying NOT NULL,
    recording_segment_index integer,
    source_order integer,
    CONSTRAINT scribe_recordings_telehealth_values CHECK ((((capture_source)::text = ANY ((ARRAY['microphone'::character varying, 'telehealth_mix'::character varying])::text[])) AND ((((capture_source)::text = 'microphone'::text) AND (telehealth_visit_id IS NULL) AND (capture_owner_participant_id IS NULL) AND (capture_epoch IS NULL) AND (recording_segment_index IS NULL) AND (source_order IS NULL)) OR (((capture_source)::text = 'telehealth_mix'::text) AND (telehealth_visit_id IS NOT NULL) AND (capture_owner_participant_id IS NOT NULL) AND (capture_epoch > 0) AND (recording_segment_index >= 0) AND (source_order > 0))))),
    CONSTRAINT scribe_recordings_values CHECK ((((status)::text = ANY ((ARRAY['recording'::character varying, 'interrupted'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])) AND ((mime_type)::text = ANY ((ARRAY['audio/webm'::character varying, 'audio/ogg'::character varying, 'audio/mp4'::character varying])::text[])) AND (expected_encounter_version >= 0) AND (total_bytes >= 0) AND ((total_chunks IS NULL) OR (total_chunks >= 0)) AND ((duration_ms IS NULL) OR (duration_ms >= 0)) AND (length(TRIM(BOTH FROM request_digest)) = 64)))
);


--
-- Name: clinic_scribe_recordings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_recordings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_recordings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_recordings_id_seq OWNED BY public.clinic_scribe_recordings.id;


--
-- Name: clinic_scribe_source_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_source_segments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    source_id bigint NOT NULL,
    sequence integer NOT NULL,
    speaker character varying DEFAULT 'unknown'::character varying NOT NULL,
    status character varying DEFAULT 'ready'::character varying NOT NULL,
    start_ms bigint DEFAULT 0 NOT NULL,
    end_ms bigint DEFAULT 0 NOT NULL,
    content text NOT NULL,
    quality_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT scribe_source_segments_values CHECK (((sequence > 0) AND (start_ms >= 0) AND (end_ms >= start_ms) AND ((speaker)::text = ANY ((ARRAY['patient'::character varying, 'clinician'::character varying, 'caregiver'::character varying, 'unknown'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['ready'::character varying, 'deleted'::character varying])::text[]))))
);


--
-- Name: clinic_scribe_source_segments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_source_segments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_source_segments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_source_segments_id_seq OWNED BY public.clinic_scribe_source_segments.id;


--
-- Name: clinic_scribe_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_scribe_sources (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    imported_by_id bigint NOT NULL,
    source_type character varying DEFAULT 'transcript'::character varying NOT NULL,
    status character varying DEFAULT 'ready'::character varying NOT NULL,
    content text NOT NULL,
    content_digest character varying NOT NULL,
    source_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    deleted_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    telehealth_visit_id bigint,
    telehealth_recording_id bigint,
    capture_epoch integer,
    recording_segment_index integer,
    source_order integer,
    source_set_digest character varying(64),
    CONSTRAINT scribe_sources_telehealth_values CHECK ((((telehealth_visit_id IS NULL) AND (telehealth_recording_id IS NULL) AND (capture_epoch IS NULL) AND (recording_segment_index IS NULL) AND (source_order IS NULL) AND (source_set_digest IS NULL)) OR ((telehealth_visit_id IS NOT NULL) AND (telehealth_recording_id IS NOT NULL) AND (capture_epoch > 0) AND (recording_segment_index >= 0) AND (source_order > 0) AND (length((source_set_digest)::text) = 64)))),
    CONSTRAINT scribe_sources_values CHECK ((((source_type)::text = 'transcript'::text) AND ((status)::text = ANY ((ARRAY['ready'::character varying, 'incomplete'::character varying, 'pending_deletion'::character varying, 'deleted'::character varying])::text[])) AND (length(TRIM(BOTH FROM content_digest)) = 64)))
);


--
-- Name: clinic_scribe_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_scribe_sources_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_scribe_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_scribe_sources_id_seq OWNED BY public.clinic_scribe_sources.id;


--
-- Name: clinic_service_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_service_options (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    name character varying NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_service_options_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_service_options_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_service_options_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_service_options_id_seq OWNED BY public.clinic_service_options.id;


--
-- Name: clinic_site_hour_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_site_hour_exceptions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    date date NOT NULL,
    closed boolean DEFAULT false NOT NULL,
    open_time time without time zone,
    close_time time without time zone,
    reason character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_site_hour_exceptions_values CHECK (((((closed = true) AND (open_time IS NULL) AND (close_time IS NULL)) OR ((closed = false) AND (open_time IS NOT NULL) AND (close_time IS NOT NULL) AND (open_time < close_time))) AND ((reason IS NULL) OR (length(TRIM(BOTH FROM reason)) <= 200))))
);


--
-- Name: clinic_site_hour_exceptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_site_hour_exceptions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_site_hour_exceptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_site_hour_exceptions_id_seq OWNED BY public.clinic_site_hour_exceptions.id;


--
-- Name: clinic_site_operating_hours; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_site_operating_hours (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    day_of_week integer NOT NULL,
    closed boolean DEFAULT false NOT NULL,
    open_time time without time zone,
    close_time time without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_site_hours_values CHECK ((((day_of_week >= 0) AND (day_of_week <= 6)) AND (((closed = true) AND (open_time IS NULL) AND (close_time IS NULL)) OR ((closed = false) AND (open_time IS NOT NULL) AND (close_time IS NOT NULL) AND (open_time < close_time)))))
);


--
-- Name: clinic_site_operating_hours_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_site_operating_hours_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_site_operating_hours_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_site_operating_hours_id_seq OWNED BY public.clinic_site_operating_hours.id;


--
-- Name: clinic_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_sites (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    code character varying NOT NULL,
    timezone_override character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    name character varying,
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    address_line1 character varying,
    address_line2 character varying,
    city character varying,
    state character varying,
    postal_code character varying,
    country character varying DEFAULT 'US'::character varying NOT NULL,
    phone character varying,
    contact_name character varying,
    contact_email character varying,
    CONSTRAINT clinic_sites_code_present CHECK ((length(TRIM(BOTH FROM code)) > 0)),
    CONSTRAINT clinic_sites_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'temporarily_closed'::character varying, 'retired'::character varying])::text[])))
);


--
-- Name: clinic_sites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_sites_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_sites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_sites_id_seq OWNED BY public.clinic_sites.id;


--
-- Name: clinic_staff_address_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_address_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    staff_member_id bigint NOT NULL,
    version integer NOT NULL,
    encrypted_address text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_staff_addresses_version_positive CHECK ((version > 0))
);


--
-- Name: clinic_staff_address_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_address_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_address_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_address_versions_id_seq OWNED BY public.clinic_staff_address_versions.id;


--
-- Name: clinic_staff_conversation_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_conversation_members (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    membership_id bigint NOT NULL,
    membership_state character varying DEFAULT 'active'::character varying NOT NULL,
    notification_policy character varying DEFAULT 'all'::character varying NOT NULL,
    last_read_message_id bigint,
    last_read_at timestamp(6) without time zone,
    joined_at timestamp(6) without time zone NOT NULL,
    removed_at timestamp(6) without time zone,
    removed_by_membership_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT staff_conversation_members_values CHECK ((((membership_state)::text = ANY ((ARRAY['active'::character varying, 'removed'::character varying])::text[])) AND ((notification_policy)::text = ANY ((ARRAY['all'::character varying, 'muted'::character varying])::text[]))))
);


--
-- Name: clinic_staff_conversation_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_conversation_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_conversation_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_conversation_members_id_seq OWNED BY public.clinic_staff_conversation_members.id;


--
-- Name: clinic_staff_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_conversations (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint,
    kind character varying NOT NULL,
    title character varying,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    created_by_membership_id bigint NOT NULL,
    retention_class character varying DEFAULT 'routine'::character varying NOT NULL,
    last_message_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT staff_conversations_values CHECK ((((kind)::text = ANY ((ARRAY['direct'::character varying, 'team'::character varying, 'role'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['active'::character varying, 'archived'::character varying, 'locked'::character varying])::text[])) AND ((retention_class)::text = ANY ((ARRAY['routine'::character varying, 'time_sensitive'::character varying, 'urgent'::character varying, 'safety_critical'::character varying])::text[]))))
);


--
-- Name: clinic_staff_conversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_conversations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_conversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_conversations_id_seq OWNED BY public.clinic_staff_conversations.id;


--
-- Name: clinic_staff_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_members (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    display_name text NOT NULL,
    job_title character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    primary_address_version_id bigint
);


--
-- Name: clinic_staff_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_members_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_members_id_seq OWNED BY public.clinic_staff_members.id;


--
-- Name: clinic_staff_message_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_message_attachments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    message_id bigint NOT NULL,
    storage_key character varying NOT NULL,
    content_type character varying NOT NULL,
    byte_size bigint NOT NULL,
    checksum character varying NOT NULL,
    scan_state character varying DEFAULT 'quarantined'::character varying NOT NULL,
    created_by_membership_id bigint CONSTRAINT clinic_staff_message_attachme_created_by_membership_id_not_null NOT NULL,
    expires_at timestamp(6) without time zone,
    deleted_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT staff_message_attachments_values CHECK (((byte_size >= 0) AND ((scan_state)::text = ANY ((ARRAY['quarantined'::character varying, 'clean'::character varying, 'rejected'::character varying, 'expired'::character varying])::text[]))))
);


--
-- Name: clinic_staff_message_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_message_attachments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_message_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_message_attachments_id_seq OWNED BY public.clinic_staff_message_attachments.id;


--
-- Name: clinic_staff_message_escalations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_message_escalations (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    message_id bigint NOT NULL,
    request_id bigint NOT NULL,
    level integer NOT NULL,
    trigger character varying NOT NULL,
    triggered_at timestamp(6) without time zone NOT NULL,
    target_membership_id bigint NOT NULL,
    delivery_state character varying DEFAULT 'pending'::character varying NOT NULL,
    dedupe_key character varying NOT NULL,
    resolved_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT staff_message_escalations_values CHECK (((level > 0) AND ((delivery_state)::text = ANY ((ARRAY['pending'::character varying, 'delivered'::character varying, 'failed'::character varying])::text[]))))
);


--
-- Name: clinic_staff_message_escalations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_message_escalations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_message_escalations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_message_escalations_id_seq OWNED BY public.clinic_staff_message_escalations.id;


--
-- Name: clinic_staff_message_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_message_outbox (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    message_id bigint NOT NULL,
    event_type character varying NOT NULL,
    delivery_state character varying DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone NOT NULL,
    delivered_at timestamp(6) without time zone,
    last_error character varying,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT staff_message_outbox_values CHECK ((((delivery_state)::text = ANY ((ARRAY['pending'::character varying, 'in_flight'::character varying, 'delivered'::character varying, 'failed'::character varying])::text[])) AND (attempts >= 0)))
);


--
-- Name: clinic_staff_message_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_message_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_message_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_message_outbox_id_seq OWNED BY public.clinic_staff_message_outbox.id;


--
-- Name: clinic_staff_message_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_message_receipts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    message_id bigint NOT NULL,
    recipient_membership_id bigint NOT NULL,
    delivered_at timestamp(6) without time zone,
    presented_at timestamp(6) without time zone,
    read_at timestamp(6) without time zone,
    acknowledged_at timestamp(6) without time zone,
    acknowledgement_note text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_staff_message_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_message_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_message_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_message_receipts_id_seq OWNED BY public.clinic_staff_message_receipts.id;


--
-- Name: clinic_staff_message_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_message_requests (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    message_id bigint NOT NULL,
    assignee_membership_id bigint,
    state character varying DEFAULT 'open'::character varying NOT NULL,
    due_at timestamp(6) without time zone NOT NULL,
    resolved_at timestamp(6) without time zone,
    resolution_code character varying,
    resolution_note text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT staff_message_requests_state CHECK (((state)::text = ANY ((ARRAY['open'::character varying, 'acknowledged'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'declined'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: clinic_staff_message_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_message_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_message_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_message_requests_id_seq OWNED BY public.clinic_staff_message_requests.id;


--
-- Name: clinic_staff_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_messages (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    sender_membership_id bigint NOT NULL,
    reply_to_message_id bigint,
    body text NOT NULL,
    message_class character varying DEFAULT 'routine'::character varying NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    request_key character varying NOT NULL,
    linked_object_type character varying,
    linked_object_id bigint,
    requested_action character varying,
    response_due_at timestamp(6) without time zone,
    acknowledgement_required boolean DEFAULT false NOT NULL,
    acknowledged_at timestamp(6) without time zone,
    acknowledged_by_membership_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT staff_messages_values CHECK ((((message_class)::text = ANY ((ARRAY['routine'::character varying, 'time_sensitive'::character varying, 'urgent'::character varying, 'safety_critical'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['active'::character varying, 'retracted'::character varying, 'expired'::character varying])::text[])) AND (length(TRIM(BOTH FROM request_key)) > 0)))
);


--
-- Name: clinic_staff_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_messages_id_seq OWNED BY public.clinic_staff_messages.id;


--
-- Name: clinic_staff_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_notification_preferences (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    membership_id bigint NOT NULL,
    routine_enabled boolean DEFAULT true NOT NULL,
    urgent_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_staff_notification_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_notification_preferences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_notification_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_notification_preferences_id_seq OWNED BY public.clinic_staff_notification_preferences.id;


--
-- Name: clinic_staff_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_notifications (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    recipient_membership_id bigint NOT NULL,
    conversation_id bigint NOT NULL,
    message_id bigint,
    category character varying NOT NULL,
    title character varying NOT NULL,
    read_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_staff_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_staff_notifications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_staff_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_staff_notifications_id_seq OWNED BY public.clinic_staff_notifications.id;


--
-- Name: clinic_stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_stock_movements (
    id bigint NOT NULL,
    item_id bigint NOT NULL,
    actor_id bigint NOT NULL,
    delta integer NOT NULL,
    reason character varying NOT NULL,
    request_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_stock_movements_id_seq OWNED BY public.clinic_stock_movements.id;


--
-- Name: clinic_stripe_checkouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_stripe_checkouts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    connection_id bigint NOT NULL,
    agreement_id bigint NOT NULL,
    collection_intent_id bigint NOT NULL,
    account_id character varying NOT NULL,
    session_id character varying,
    application_fee_cents integer NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    subscription_id character varying,
    subscription_status character varying,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    last_synced_at timestamp(6) without time zone,
    session_status character varying,
    renewal_amount_due numeric(14,2),
    renewal_invoice_status character varying,
    CONSTRAINT stripe_checkout_fee_nonnegative CHECK ((application_fee_cents >= 0))
);


--
-- Name: clinic_stripe_checkouts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_stripe_checkouts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_stripe_checkouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_stripe_checkouts_id_seq OWNED BY public.clinic_stripe_checkouts.id;


--
-- Name: clinic_stripe_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_stripe_connections (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    connected_by_id bigint NOT NULL,
    reference character varying NOT NULL,
    account_id character varying,
    charges_enabled boolean DEFAULT false NOT NULL,
    payouts_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    last_synced_at timestamp(6) without time zone
);


--
-- Name: clinic_stripe_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_stripe_connections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_stripe_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_stripe_connections_id_seq OWNED BY public.clinic_stripe_connections.id;


--
-- Name: clinic_stripe_membership_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_stripe_membership_cycles (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    checkout_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    provider_invoice_id character varying NOT NULL,
    provider_payment_id character varying NOT NULL,
    period_start timestamp(6) without time zone NOT NULL,
    period_end timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT stripe_cycle_period CHECK ((period_end > period_start))
);


--
-- Name: clinic_stripe_membership_cycles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_stripe_membership_cycles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_stripe_membership_cycles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_stripe_membership_cycles_id_seq OWNED BY public.clinic_stripe_membership_cycles.id;


--
-- Name: clinic_subscription_agreements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_subscription_agreements (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    version_id bigint NOT NULL,
    invoice_id bigint NOT NULL,
    snapshot jsonb NOT NULL,
    amount numeric(20,6) NOT NULL,
    currency character varying NOT NULL,
    request_key character varying NOT NULL,
    request_digest character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT subscription_purchase_values CHECK (((amount > (0)::numeric) AND (amount = round(amount, 2)) AND ((currency)::text ~ '^[A-Z]{3}$'::text) AND (jsonb_typeof(snapshot) = 'object'::text)))
);


--
-- Name: clinic_subscription_agreements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_subscription_agreements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_subscription_agreements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_subscription_agreements_id_seq OWNED BY public.clinic_subscription_agreements.id;


--
-- Name: clinic_subscription_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_subscription_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    agreement_id bigint NOT NULL,
    kind character varying NOT NULL,
    request_key character varying NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT subscription_event_values CHECK ((((kind)::text = ANY ((ARRAY['pending_review'::character varying, 'review_approved'::character varying, 'review_declined'::character varying, 'pending_payment'::character varying, 'processing'::character varying, 'payment_failed'::character varying, 'outcome_unknown'::character varying, 'active'::character varying, 'canceled'::character varying, 'refunded'::character varying, 'expired'::character varying])::text[])) AND (jsonb_typeof(details) = 'object'::text)))
);


--
-- Name: clinic_subscription_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_subscription_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_subscription_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_subscription_events_id_seq OWNED BY public.clinic_subscription_events.id;


--
-- Name: clinic_subscription_families; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_subscription_families (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    name character varying NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    published_snapshot jsonb,
    CONSTRAINT subscription_program_display_order CHECK ((display_order >= 0))
);


--
-- Name: clinic_subscription_families_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_subscription_families_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_subscription_families_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_subscription_families_id_seq OWNED BY public.clinic_subscription_families.id;


--
-- Name: clinic_subscription_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_subscription_packages (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    family_id bigint NOT NULL,
    name character varying NOT NULL,
    draft jsonb DEFAULT '{}'::jsonb NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    retired boolean DEFAULT false NOT NULL,
    published_version_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: clinic_subscription_packages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_subscription_packages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_subscription_packages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_subscription_packages_id_seq OWNED BY public.clinic_subscription_packages.id;


--
-- Name: clinic_subscription_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_subscription_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    package_id bigint NOT NULL,
    number integer NOT NULL,
    snapshot jsonb NOT NULL,
    request_key character varying NOT NULL,
    request_digest character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT subscription_version_values CHECK (((number > 0) AND (jsonb_typeof(snapshot) = 'object'::text)))
);


--
-- Name: clinic_subscription_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_subscription_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_subscription_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_subscription_versions_id_seq OWNED BY public.clinic_subscription_versions.id;


--
-- Name: clinic_supplier_address_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_supplier_address_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    supplier_id bigint NOT NULL,
    version integer NOT NULL,
    encrypted_address text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_supplier_addresses_version_positive CHECK ((version > 0))
);


--
-- Name: clinic_supplier_address_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_supplier_address_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_supplier_address_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_supplier_address_versions_id_seq OWNED BY public.clinic_supplier_address_versions.id;


--
-- Name: clinic_telehealth_checkins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_checkins (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    participant_id bigint NOT NULL,
    sequence integer NOT NULL,
    access_generation integer NOT NULL,
    location_payload text,
    callback_phone text,
    location_attested boolean NOT NULL,
    device_results jsonb DEFAULT '{}'::jsonb NOT NULL,
    submitted_at timestamp(6) without time zone NOT NULL,
    supersedes_checkin_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_checkin_values CHECK (((sequence > 0) AND (access_generation > 0) AND (jsonb_typeof(device_results) = 'object'::text)))
);


--
-- Name: clinic_telehealth_checkins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_checkins_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_checkins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_checkins_id_seq OWNED BY public.clinic_telehealth_checkins.id;


--
-- Name: clinic_telehealth_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_commands (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    room_attempt_id bigint,
    participant_id bigint,
    kind character varying(32) NOT NULL,
    requested_expires_at timestamp(6) without time zone,
    dedupe_key character varying(160) NOT NULL,
    access_generation integer NOT NULL,
    status character varying(16) DEFAULT 'pending'::character varying NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    available_at timestamp(6) without time zone NOT NULL,
    lease_token uuid,
    leased_until timestamp(6) without time zone,
    last_attempt_at timestamp(6) without time zone,
    completed_at timestamp(6) without time zone,
    last_error_code character varying(80),
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_command_values CHECK ((((kind)::text = ANY ((ARRAY['create_room'::character varying, 'end_room'::character varying, 'extend_room'::character varying, 'eject_participant'::character varying, 'reconcile_room'::character varying, 'delete_room'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['pending'::character varying, 'leased'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'unknown'::character varying, 'suppressed'::character varying])::text[])) AND (access_generation > 0) AND (attempt_count >= 0) AND ((((kind)::text = 'extend_room'::text) AND (requested_expires_at IS NOT NULL)) OR (((kind)::text <> 'extend_room'::text) AND (requested_expires_at IS NULL))) AND ((((status)::text = 'leased'::text) AND (lease_token IS NOT NULL) AND (leased_until IS NOT NULL)) OR ((status)::text <> 'leased'::text))))
);


--
-- Name: clinic_telehealth_commands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_commands_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_commands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_commands_id_seq OWNED BY public.clinic_telehealth_commands.id;


--
-- Name: clinic_telehealth_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_consents (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    participant_id bigint NOT NULL,
    policy_version_id bigint NOT NULL,
    purpose character varying(24) DEFAULT 'telehealth'::character varying NOT NULL,
    decision character varying(16) NOT NULL,
    sequence integer NOT NULL,
    decided_at timestamp(6) without time zone NOT NULL,
    method character varying(24) DEFAULT 'portal_authenticated'::character varying NOT NULL,
    policy_content_digest character varying(64) NOT NULL,
    supersedes_consent_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_consent_values CHECK ((((purpose)::text = ANY ((ARRAY['telehealth'::character varying, 'scribe_recording'::character varying])::text[])) AND ((decision)::text = ANY ((ARRAY['accepted'::character varying, 'declined'::character varying, 'withdrawn'::character varying])::text[])) AND (sequence > 0) AND ((method)::text = ANY ((ARRAY['portal_authenticated'::character varying, 'staff_authenticated'::character varying])::text[])) AND (length((policy_content_digest)::text) = 64)))
);


--
-- Name: clinic_telehealth_consents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_consents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_consents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_consents_id_seq OWNED BY public.clinic_telehealth_consents.id;


--
-- Name: clinic_telehealth_join_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_join_grants (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    participant_id bigint NOT NULL,
    room_attempt_id bigint NOT NULL,
    access_generation integer NOT NULL,
    token_digest character varying(64) NOT NULL,
    request_digest character varying(64) NOT NULL,
    issued_at timestamp(6) without time zone NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    revoked_at timestamp(6) without time zone,
    revocation_reason character varying(40),
    created_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_join_grant_values CHECK (((access_generation > 0) AND (length((token_digest)::text) = 64) AND (length((request_digest)::text) = 64) AND (expires_at > issued_at)))
);


--
-- Name: clinic_telehealth_join_grants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_join_grants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_join_grants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_join_grants_id_seq OWNED BY public.clinic_telehealth_join_grants.id;


--
-- Name: clinic_telehealth_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_participants (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    role character varying(24) NOT NULL,
    portal_identity_id bigint,
    membership_id bigint,
    provider_subject_id uuid DEFAULT gen_random_uuid() NOT NULL,
    status character varying(24) DEFAULT 'eligible'::character varying NOT NULL,
    admitted_by_membership_id bigint,
    admitted_at timestamp(6) without time zone,
    admitted_generation integer,
    admitted_checkin_id bigint,
    last_seen_at timestamp(6) without time zone,
    revoked_at timestamp(6) without time zone,
    revocation_reason character varying(40),
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_participant_values CHECK ((((role)::text = ANY ((ARRAY['patient'::character varying, 'clinician'::character varying, 'assistant'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['eligible'::character varying, 'waiting'::character varying, 'admitted'::character varying, 'left'::character varying, 'removed'::character varying])::text[])) AND ((((role)::text = 'patient'::text) AND (portal_identity_id IS NOT NULL) AND (membership_id IS NULL)) OR (((role)::text = ANY ((ARRAY['clinician'::character varying, 'assistant'::character varying])::text[])) AND (portal_identity_id IS NULL) AND (membership_id IS NOT NULL))) AND ((((status)::text = 'admitted'::text) AND (admitted_at IS NOT NULL) AND (admitted_generation IS NOT NULL)) OR ((status)::text <> 'admitted'::text))))
);


--
-- Name: clinic_telehealth_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_participants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_participants_id_seq OWNED BY public.clinic_telehealth_participants.id;


--
-- Name: clinic_telehealth_patient_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_patient_receipts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    portal_identity_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    request_key character varying(160) NOT NULL,
    operation_code character varying(80) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    digest_key_id character varying(80) NOT NULL,
    digest_algorithm character varying(32) NOT NULL,
    outcome character varying(24) NOT NULL,
    result_kind character varying(24) NOT NULL,
    result_id bigint,
    result_version integer,
    created_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_patient_receipt_values CHECK (((length((payload_digest)::text) = 64) AND ((digest_algorithm)::text = 'HMAC-SHA256'::text) AND ((outcome)::text = ANY ((ARRAY['committed'::character varying, 'outcome_unconfirmed'::character varying])::text[])) AND ((result_kind)::text = ANY ((ARRAY['checkin'::character varying, 'consent'::character varying, 'participant'::character varying, 'visit'::character varying])::text[]))))
);


--
-- Name: clinic_telehealth_patient_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_patient_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_patient_receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_patient_receipts_id_seq OWNED BY public.clinic_telehealth_patient_receipts.id;


--
-- Name: clinic_telehealth_policy_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_policy_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    settings_id bigint NOT NULL,
    version integer NOT NULL,
    status character varying(16) DEFAULT 'draft'::character varying NOT NULL,
    consent_title character varying(160) NOT NULL,
    consent_body text NOT NULL,
    content_digest character varying(64) NOT NULL,
    locale character varying(20) NOT NULL,
    patient_instructions text NOT NULL,
    support_label character varying(120) NOT NULL,
    support_phone character varying(32),
    support_url text,
    join_early_minutes integer NOT NULL,
    join_late_minutes integer NOT NULL,
    max_room_minutes integer NOT NULL,
    grant_ttl_seconds integer NOT NULL,
    checkin_max_age_minutes integer CONSTRAINT clinic_telehealth_policy_versi_checkin_max_age_minutes_not_null NOT NULL,
    allow_audio_only boolean DEFAULT false NOT NULL,
    allow_staff_screen_share boolean DEFAULT true CONSTRAINT clinic_telehealth_policy_vers_allow_staff_screen_share_not_null NOT NULL,
    scribe_enabled boolean DEFAULT false NOT NULL,
    require_location boolean DEFAULT true NOT NULL,
    require_callback boolean DEFAULT true NOT NULL,
    scribe_consent_title character varying(160),
    scribe_consent_body text,
    scribe_consent_digest character varying(64),
    created_by_membership_id bigint CONSTRAINT clinic_telehealth_policy_vers_created_by_membership_id_not_null NOT NULL,
    published_by_membership_id bigint,
    published_at timestamp(6) without time zone,
    retired_at timestamp(6) without time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_policy_values CHECK (((version > 0) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'retired'::character varying])::text[])) AND (length((content_digest)::text) = 64) AND ((join_early_minutes >= 0) AND (join_early_minutes <= 120)) AND ((join_late_minutes >= 0) AND (join_late_minutes <= 120)) AND ((max_room_minutes >= 5) AND (max_room_minutes <= 240)) AND ((grant_ttl_seconds >= 30) AND (grant_ttl_seconds <= 300)) AND ((checkin_max_age_minutes >= 5) AND (checkin_max_age_minutes <= 1440)) AND (((scribe_consent_title IS NULL) AND (scribe_consent_body IS NULL) AND (scribe_consent_digest IS NULL) AND (scribe_enabled = false)) OR ((scribe_consent_title IS NOT NULL) AND (scribe_consent_body IS NOT NULL) AND (length((scribe_consent_digest)::text) = 64))) AND ((((status)::text = 'draft'::text) AND (published_at IS NULL) AND (published_by_membership_id IS NULL)) OR (((status)::text = ANY ((ARRAY['published'::character varying, 'retired'::character varying])::text[])) AND (published_at IS NOT NULL) AND (published_by_membership_id IS NOT NULL)))))
);


--
-- Name: clinic_telehealth_policy_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_policy_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_policy_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_policy_versions_id_seq OWNED BY public.clinic_telehealth_policy_versions.id;


--
-- Name: clinic_telehealth_provider_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_provider_events (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    room_attempt_id bigint NOT NULL,
    participant_id bigint,
    provider_code character varying(32) NOT NULL,
    provider_account_ref character varying(128) NOT NULL,
    provider_event_id character varying(160) NOT NULL,
    event_type character varying(48) NOT NULL,
    provider_session_ref character varying(160),
    occurred_at timestamp(6) without time zone NOT NULL,
    received_at timestamp(6) without time zone NOT NULL,
    payload_digest character varying(64) NOT NULL,
    normalized_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_provider_event_values CHECK ((((provider_code)::text = ANY ((ARRAY['daily'::character varying, 'twilio'::character varying])::text[])) AND (length((payload_digest)::text) = 64) AND (jsonb_typeof(normalized_metadata) = 'object'::text)))
);


--
-- Name: clinic_telehealth_provider_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_provider_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_provider_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_provider_events_id_seq OWNED BY public.clinic_telehealth_provider_events.id;


--
-- Name: clinic_telehealth_room_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_room_attempts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    attempt_no integer NOT NULL,
    provider_code character varying(32) NOT NULL,
    provider_account_ref character varying(128) NOT NULL,
    provider_room_name character varying(128) NOT NULL,
    provider_room_url text,
    status character varying(24) DEFAULT 'pending'::character varying NOT NULL,
    access_generation integer NOT NULL,
    provisioned_at timestamp(6) without time zone,
    expires_at timestamp(6) without time zone NOT NULL,
    started_at timestamp(6) without time zone,
    ended_at timestamp(6) without time zone,
    last_reconciled_at timestamp(6) without time zone,
    last_error_code character varying(80),
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    provider_room_ref character varying(64),
    CONSTRAINT telehealth_room_attempt_values CHECK (((attempt_no > 0) AND ((provider_code)::text = ANY ((ARRAY['daily'::character varying, 'twilio'::character varying])::text[])) AND (access_generation > 0) AND ((status)::text = ANY ((ARRAY['pending'::character varying, 'provisioning'::character varying, 'ready'::character varying, 'active'::character varying, 'ending'::character varying, 'ended'::character varying, 'failed'::character varying, 'unknown'::character varying])::text[])) AND (expires_at > created_at) AND ((provider_room_ref IS NULL) OR (((provider_code)::text = 'twilio'::text) AND ((provider_room_ref)::text ~ '^RM[0-9A-Fa-f]{32}$'::text)))))
);


--
-- Name: clinic_telehealth_room_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_room_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_room_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_room_attempts_id_seq OWNED BY public.clinic_telehealth_room_attempts.id;


--
-- Name: clinic_telehealth_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_settings (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    provider_code character varying(32) DEFAULT 'twilio'::character varying NOT NULL,
    provider_account_ref character varying(128),
    enabled boolean DEFAULT false NOT NULL,
    active_policy_version_id bigint,
    health_status character varying(24) DEFAULT 'not_checked'::character varying NOT NULL,
    health_checked_at timestamp(6) without time zone,
    last_error_code character varying(80),
    updated_by_membership_id bigint NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_settings_values CHECK ((((provider_code)::text = ANY ((ARRAY['daily'::character varying, 'twilio'::character varying])::text[])) AND ((health_status)::text = ANY ((ARRAY['not_checked'::character varying, 'ready'::character varying, 'degraded'::character varying, 'unconfigured'::character varying])::text[]))))
);


--
-- Name: clinic_telehealth_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_settings_id_seq OWNED BY public.clinic_telehealth_settings.id;


--
-- Name: clinic_telehealth_visit_type_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_visit_type_rules (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    visit_type_id bigint NOT NULL,
    site_id bigint,
    enabled boolean DEFAULT false NOT NULL,
    allowed_region_codes jsonb DEFAULT '[]'::jsonb CONSTRAINT clinic_telehealth_visit_type_rule_allowed_region_codes_not_null NOT NULL,
    min_patient_age_years integer,
    max_patient_age_years integer,
    updated_by_membership_id bigint CONSTRAINT clinic_telehealth_visit_type__updated_by_membership_id_not_null NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_visit_type_rule_values CHECK (((jsonb_typeof(allowed_region_codes) = 'array'::text) AND (jsonb_array_length(allowed_region_codes) <= 250) AND ((min_patient_age_years IS NULL) OR ((min_patient_age_years >= 0) AND (min_patient_age_years <= 130))) AND ((max_patient_age_years IS NULL) OR ((max_patient_age_years >= 0) AND (max_patient_age_years <= 130))) AND ((min_patient_age_years IS NULL) OR (max_patient_age_years IS NULL) OR (min_patient_age_years <= max_patient_age_years))))
);


--
-- Name: clinic_telehealth_visit_type_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_visit_type_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_visit_type_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_visit_type_rules_id_seq OWNED BY public.clinic_telehealth_visit_type_rules.id;


--
-- Name: clinic_telehealth_visits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_visits (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    public_id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id bigint NOT NULL,
    appointment_id bigint NOT NULL,
    encounter_id bigint,
    policy_version_id bigint NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying NOT NULL,
    access_generation integer DEFAULT 1 NOT NULL,
    current_room_attempt_id bigint,
    first_started_at timestamp(6) without time zone,
    last_ended_at timestamp(6) without time zone,
    ended_by_membership_id bigint,
    end_reason_code character varying(40),
    created_by_membership_id bigint NOT NULL,
    scribe_encounter_id bigint,
    scribe_capture_owner_participant_id bigint,
    scribe_capture_owner_token_digest character varying(64),
    scribe_capture_epoch integer DEFAULT 0 NOT NULL,
    scribe_capture_lease_expires_at timestamp(6) without time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_visit_values CHECK ((((status)::text = ANY ((ARRAY['scheduled'::character varying, 'in_progress'::character varying, 'ending'::character varying, 'ended'::character varying, 'cancelled'::character varying, 'no_show'::character varying])::text[])) AND (access_generation > 0) AND (scribe_capture_epoch >= 0) AND (((scribe_capture_owner_participant_id IS NULL) AND (scribe_capture_owner_token_digest IS NULL) AND (scribe_capture_lease_expires_at IS NULL)) OR ((scribe_capture_owner_participant_id IS NOT NULL) AND (length((scribe_capture_owner_token_digest)::text) = 64) AND (scribe_capture_lease_expires_at IS NOT NULL)))))
);


--
-- Name: clinic_telehealth_visits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_visits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_visits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_visits_id_seq OWNED BY public.clinic_telehealth_visits.id;


--
-- Name: clinic_telehealth_wrap_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_telehealth_wrap_ups (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    visit_id bigint NOT NULL,
    patient_id bigint NOT NULL,
    appointment_id bigint NOT NULL,
    encounter_id bigint NOT NULL,
    status character varying(16) DEFAULT 'draft'::character varying NOT NULL,
    outcome character varying(32),
    clinician_notes text DEFAULT ''::text NOT NULL,
    patient_instructions text DEFAULT ''::text NOT NULL,
    instruction_note_id bigint,
    instruction_note_revision_id bigint,
    instruction_note_signature_id bigint,
    follow_up_status character varying(16),
    follow_up_plan text DEFAULT ''::text NOT NULL,
    follow_up_appointment_id bigint,
    scribe_review_status character varying(24),
    scribe_encounter_id bigint,
    scribe_encounter_status character varying(24),
    scribe_draft_id bigint,
    scribe_draft_status character varying(24),
    scribe_export_id bigint,
    scribe_export_state character varying(24),
    scribe_encounter_note_id bigint,
    scribe_encounter_note_revision_id bigint,
    created_by_membership_id bigint NOT NULL,
    updated_by_membership_id bigint NOT NULL,
    finalized_by_membership_id bigint,
    finalized_at timestamp(6) without time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT telehealth_wrap_ups_values CHECK ((((status)::text = ANY ((ARRAY['draft'::character varying, 'finalized'::character varying])::text[])) AND ((outcome IS NULL) OR ((outcome)::text = ANY ((ARRAY['completed'::character varying, 'technical_failure'::character varying, 'follow_up_needed'::character varying])::text[]))) AND ((follow_up_status IS NULL) OR ((follow_up_status)::text = ANY ((ARRAY['none'::character varying, 'needed'::character varying, 'arranged'::character varying])::text[]))) AND ((scribe_review_status IS NULL) OR ((scribe_review_status)::text = ANY ((ARRAY['not_used'::character varying, 'reviewed'::character varying, 'deferred'::character varying])::text[]))) AND ((((follow_up_status)::text = 'arranged'::text) AND (follow_up_appointment_id IS NOT NULL)) OR (((follow_up_status)::text IS DISTINCT FROM 'arranged'::text) AND (follow_up_appointment_id IS NULL))) AND ((((status)::text = 'draft'::text) AND (finalized_at IS NULL) AND (finalized_by_membership_id IS NULL)) OR (((status)::text = 'finalized'::text) AND (outcome IS NOT NULL) AND (follow_up_status IS NOT NULL) AND (scribe_review_status IS NOT NULL) AND (instruction_note_id IS NOT NULL) AND (instruction_note_revision_id IS NOT NULL) AND (instruction_note_signature_id IS NOT NULL) AND (finalized_at IS NOT NULL) AND (finalized_by_membership_id IS NOT NULL)))))
);


--
-- Name: clinic_telehealth_wrap_ups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_telehealth_wrap_ups_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_telehealth_wrap_ups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_telehealth_wrap_ups_id_seq OWNED BY public.clinic_telehealth_wrap_ups.id;


--
-- Name: clinic_visit_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_visit_types (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    code character varying NOT NULL,
    retired_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_visit_types_code_present CHECK ((length(TRIM(BOTH FROM code)) > 0))
);


--
-- Name: clinic_visit_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_visit_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_visit_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_visit_types_id_seq OWNED BY public.clinic_visit_types.id;


--
-- Name: clinic_workforce_adjustment_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_adjustment_requests (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    timecard_version_id bigint CONSTRAINT clinic_workforce_adjustment_reques_timecard_version_id_not_null NOT NULL,
    status character varying DEFAULT 'submitted'::character varying NOT NULL,
    correction_type character varying NOT NULL,
    proposed_changes jsonb DEFAULT '{}'::jsonb NOT NULL,
    reason character varying(1000) NOT NULL,
    requested_by_membership_id bigint CONSTRAINT clinic_workforce_adjustment_requested_by_membership_id_not_null NOT NULL,
    requested_at timestamp(6) without time zone NOT NULL,
    reviewed_by_membership_id bigint,
    reviewed_at timestamp(6) without time zone,
    decision_reason character varying(1000),
    request_key character varying(36) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    source_lock_version integer CONSTRAINT clinic_workforce_adjustment_reques_source_lock_version_not_null NOT NULL,
    resulting_timecard_version_id bigint,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_adjustments_valid CHECK ((((status)::text = ANY ((ARRAY['submitted'::character varying, 'approved'::character varying, 'denied'::character varying])::text[])) AND ((correction_type)::text = ANY ((ARRAY['add_segment'::character varying, 'replace_segment'::character varying, 'remove_segment'::character varying])::text[])) AND (length(TRIM(BOTH FROM reason)) > 0) AND (length((request_key)::text) = 36) AND (length((payload_digest)::text) = 64) AND (jsonb_typeof(proposed_changes) = 'object'::text)))
);


--
-- Name: clinic_workforce_adjustment_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_adjustment_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_adjustment_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_adjustment_requests_id_seq OWNED BY public.clinic_workforce_adjustment_requests.id;


--
-- Name: clinic_workforce_availability_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_availability_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    created_by_id bigint NOT NULL,
    effective_from date NOT NULL,
    effective_until date,
    public_id character varying NOT NULL,
    timezone character varying NOT NULL,
    status character varying NOT NULL,
    reason character varying NOT NULL,
    idempotency_key character varying NOT NULL,
    request_digest character varying NOT NULL,
    decision_reason character varying,
    weekly_rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    decision_receipts jsonb DEFAULT '{}'::jsonb CONSTRAINT clinic_workforce_availability_versio_decision_receipts_not_null NOT NULL,
    reviewed_by_id bigint,
    submitted_at timestamp(6) without time zone,
    decided_at timestamp(6) without time zone,
    cancelled_at timestamp(6) without time zone,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_workforce_availability_versions_digest CHECK ((length((request_digest)::text) = 64)),
    CONSTRAINT workforce_availability_values CHECK ((((status)::text = ANY ((ARRAY['submitted'::character varying, 'approved'::character varying, 'denied'::character varying, 'cancelled'::character varying, 'superseded'::character varying])::text[])) AND (revision > 0) AND ((effective_until IS NULL) OR (effective_until >= effective_from)) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 500)) AND ((decision_reason IS NULL) OR ((length(TRIM(BOTH FROM decision_reason)) >= 1) AND (length(TRIM(BOTH FROM decision_reason)) <= 500)))))
);


--
-- Name: clinic_workforce_availability_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_availability_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_availability_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_availability_versions_id_seq OWNED BY public.clinic_workforce_availability_versions.id;


--
-- Name: clinic_workforce_badge_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_badge_credentials (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    secret_digest character varying(64) NOT NULL,
    pin_digest character varying,
    format character varying DEFAULT 'code128'::character varying NOT NULL,
    status character varying DEFAULT 'issued'::character varying NOT NULL,
    issued_by_membership_id bigint CONSTRAINT clinic_workforce_badge_credent_issued_by_membership_id_not_null NOT NULL,
    issued_at timestamp(6) without time zone NOT NULL,
    revoked_by_membership_id bigint,
    revoked_at timestamp(6) without time zone,
    replaced_by_id bigint,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_badges_valid CHECK (((length((secret_digest)::text) = 64) AND ((format)::text = 'code128'::text) AND ((status)::text = ANY ((ARRAY['issued'::character varying, 'revoked'::character varying, 'replaced'::character varying])::text[]))))
);


--
-- Name: clinic_workforce_badge_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_badge_credentials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_badge_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_badge_credentials_id_seq OWNED BY public.clinic_workforce_badge_credentials.id;


--
-- Name: clinic_workforce_employee_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_employee_invitations (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    staff_member_id bigint NOT NULL,
    invited_by_membership_id bigint CONSTRAINT clinic_workforce_employee_inv_invited_by_membership_id_not_null NOT NULL,
    email_address text NOT NULL,
    email_digest character varying(64),
    token_digest character varying(64),
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    invited_at timestamp(6) without time zone NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    activated_at timestamp(6) without time zone,
    revoked_at timestamp(6) without time zone,
    effective_from timestamp(6) without time zone NOT NULL,
    site_ids bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    role_version_id bigint NOT NULL,
    CONSTRAINT workforce_employee_invitations_state CHECK ((((status)::text = ANY ((ARRAY['pending'::character varying, 'activated'::character varying, 'revoked'::character varying])::text[])) AND (expires_at > invited_at) AND ((cardinality(site_ids) >= 1) AND (cardinality(site_ids) <= 100))))
);


--
-- Name: clinic_workforce_employee_invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_employee_invitations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_employee_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_employee_invitations_id_seq OWNED BY public.clinic_workforce_employee_invitations.id;


--
-- Name: clinic_workforce_employment_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_employment_sites (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    site_id bigint NOT NULL,
    active boolean DEFAULT true NOT NULL,
    effective_from timestamp(6) without time zone NOT NULL,
    effective_until timestamp(6) without time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_employment_sites_window CHECK (((effective_until IS NULL) OR (effective_until > effective_from)))
);


--
-- Name: clinic_workforce_employment_sites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_employment_sites_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_employment_sites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_employment_sites_id_seq OWNED BY public.clinic_workforce_employment_sites.id;


--
-- Name: clinic_workforce_employments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_employments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    staff_member_id bigint NOT NULL,
    membership_id bigint NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    effective_from timestamp(6) without time zone NOT NULL,
    effective_until timestamp(6) without time zone,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_employments_state CHECK ((((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying])::text[])) AND ((effective_until IS NULL) OR (effective_until > effective_from))))
);


--
-- Name: clinic_workforce_employments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_employments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_employments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_employments_id_seq OWNED BY public.clinic_workforce_employments.id;


--
-- Name: clinic_workforce_export_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_export_batches (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    configuration_version_id bigint CONSTRAINT clinic_workforce_export_batch_configuration_version_id_not_null NOT NULL,
    created_by_membership_id bigint CONSTRAINT clinic_workforce_export_batch_created_by_membership_id_not_null NOT NULL,
    supersedes_batch_id bigint,
    request_key character varying NOT NULL,
    payload_digest character varying NOT NULL,
    source_digest character varying NOT NULL,
    source_versions jsonb DEFAULT '[]'::jsonb NOT NULL,
    rows jsonb DEFAULT '[]'::jsonb NOT NULL,
    totals jsonb DEFAULT '{}'::jsonb NOT NULL,
    csv_content text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT wf_export_keys CHECK ((((length((request_key)::text) >= 8) AND (length((request_key)::text) <= 100)) AND (length((payload_digest)::text) = 64) AND (length((source_digest)::text) = 64)))
);


--
-- Name: clinic_workforce_export_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_export_batches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_export_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_export_batches_id_seq OWNED BY public.clinic_workforce_export_batches.id;


--
-- Name: clinic_workforce_kiosk_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_kiosk_enrollments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    token_digest character varying(64) NOT NULL,
    status character varying DEFAULT 'issued'::character varying NOT NULL,
    issued_by_membership_id bigint CONSTRAINT clinic_workforce_kiosk_enrollm_issued_by_membership_id_not_null NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    enrolled_at timestamp(6) without time zone,
    revoked_by_membership_id bigint,
    revoked_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_kiosk_enrollments_valid CHECK (((length((token_digest)::text) = 64) AND ((status)::text = ANY ((ARRAY['issued'::character varying, 'enrolled'::character varying, 'revoked'::character varying, 'expired'::character varying])::text[]))))
);


--
-- Name: clinic_workforce_kiosk_enrollments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_kiosk_enrollments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_kiosk_enrollments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_kiosk_enrollments_id_seq OWNED BY public.clinic_workforce_kiosk_enrollments.id;


--
-- Name: clinic_workforce_kiosk_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_kiosk_sessions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    kiosk_enrollment_id bigint NOT NULL,
    session_digest character varying(64) NOT NULL,
    status character varying DEFAULT 'active'::character varying NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    last_seen_at timestamp(6) without time zone NOT NULL,
    revoked_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_kiosk_sessions_valid CHECK (((length((session_digest)::text) = 64) AND ((status)::text = ANY ((ARRAY['active'::character varying, 'revoked'::character varying, 'expired'::character varying])::text[]))))
);


--
-- Name: clinic_workforce_kiosk_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_kiosk_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_kiosk_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_kiosk_sessions_id_seq OWNED BY public.clinic_workforce_kiosk_sessions.id;


--
-- Name: clinic_workforce_payroll_configuration_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_payroll_configuration_versions (
    id bigint NOT NULL,
    practice_id bigint CONSTRAINT clinic_workforce_payroll_configuration_ver_practice_id_not_null NOT NULL,
    site_id bigint CONSTRAINT clinic_workforce_payroll_configuration_version_site_id_not_null NOT NULL,
    created_by_membership_id bigint CONSTRAINT clinic_workforce_payroll_conf_created_by_membership_id_not_null NOT NULL,
    revision integer CONSTRAINT clinic_workforce_payroll_configuration_versio_revision_not_null NOT NULL,
    effective_from timestamp(6) without time zone CONSTRAINT clinic_workforce_payroll_configuration__effective_from_not_null NOT NULL,
    name character varying NOT NULL,
    provider character varying DEFAULT 'custom_file'::character varying CONSTRAINT clinic_workforce_payroll_configuration_versio_provider_not_null NOT NULL,
    columns jsonb DEFAULT '[]'::jsonb CONSTRAINT clinic_workforce_payroll_configuration_version_columns_not_null NOT NULL,
    employee_identifiers jsonb DEFAULT '{}'::jsonb CONSTRAINT clinic_workforce_payroll_configur_employee_identifiers_not_null NOT NULL,
    created_at timestamp(6) without time zone CONSTRAINT clinic_workforce_payroll_configuration_vers_created_at_not_null NOT NULL,
    updated_at timestamp(6) without time zone CONSTRAINT clinic_workforce_payroll_configuration_vers_updated_at_not_null NOT NULL,
    CONSTRAINT wf_payroll_provider CHECK ((((provider)::text = 'custom_file'::text) AND (revision > 0)))
);


--
-- Name: clinic_workforce_payroll_configuration_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_payroll_configuration_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_payroll_configuration_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_payroll_configuration_versions_id_seq OWNED BY public.clinic_workforce_payroll_configuration_versions.id;


--
-- Name: clinic_workforce_punch_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_punch_challenges (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    kiosk_session_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    challenge_digest character varying(64) NOT NULL,
    permitted_transitions jsonb DEFAULT '[]'::jsonb CONSTRAINT clinic_workforce_punch_challenge_permitted_transitions_not_null NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    consumed_at timestamp(6) without time zone,
    failed_attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_punch_challenges_valid CHECK (((length((challenge_digest)::text) = 64) AND (jsonb_typeof(permitted_transitions) = 'array'::text) AND ((failed_attempts >= 0) AND (failed_attempts <= 20))))
);


--
-- Name: clinic_workforce_punch_challenges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_punch_challenges_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_punch_challenges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_punch_challenges_id_seq OWNED BY public.clinic_workforce_punch_challenges.id;


--
-- Name: clinic_workforce_punches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_punches (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    kiosk_session_id bigint,
    punch_challenge_id bigint,
    event_type character varying NOT NULL,
    occurred_at_utc timestamp(6) without time zone NOT NULL,
    time_zone character varying NOT NULL,
    utc_offset_seconds integer NOT NULL,
    local_date date NOT NULL,
    source character varying DEFAULT 'kiosk'::character varying NOT NULL,
    request_key character varying(36) NOT NULL,
    payload_digest character varying(64) NOT NULL,
    correlation_id character varying(36) NOT NULL,
    received_at timestamp(6) without time zone NOT NULL,
    result_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_punches_valid CHECK ((((event_type)::text = ANY ((ARRAY['clock_in'::character varying, 'break_start'::character varying, 'break_end'::character varying, 'clock_out'::character varying])::text[])) AND ((source)::text = ANY ((ARRAY['kiosk'::character varying, 'manager_correction'::character varying])::text[])) AND (length((request_key)::text) = 36) AND (length((payload_digest)::text) = 64) AND (length((correlation_id)::text) = 36) AND (jsonb_typeof(result_snapshot) = 'object'::text)))
);


--
-- Name: clinic_workforce_punches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_punches_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_punches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_punches_id_seq OWNED BY public.clinic_workforce_punches.id;


--
-- Name: clinic_workforce_schedule_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_schedule_drafts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    created_by_id bigint NOT NULL,
    schedule_template_id bigint,
    week_start_on date NOT NULL,
    timezone character varying NOT NULL,
    status character varying NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_schedule_drafts_values CHECK ((((status)::text = ANY ((ARRAY['draft'::character varying, 'published'::character varying, 'superseded'::character varying])::text[])) AND ((length(TRIM(BOTH FROM timezone)) >= 1) AND (length(TRIM(BOTH FROM timezone)) <= 80)) AND (revision > 0)))
);


--
-- Name: clinic_workforce_schedule_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_schedule_drafts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_schedule_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_schedule_drafts_id_seq OWNED BY public.clinic_workforce_schedule_drafts.id;


--
-- Name: clinic_workforce_schedule_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_schedule_publications (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    schedule_draft_id bigint CONSTRAINT clinic_workforce_schedule_publicatio_schedule_draft_id_not_null NOT NULL,
    published_by_id bigint NOT NULL,
    supersedes_id bigint,
    week_start_on date NOT NULL,
    timezone character varying NOT NULL,
    snapshot_digest character varying NOT NULL,
    idempotency_key character varying NOT NULL,
    request_digest character varying NOT NULL,
    version integer NOT NULL,
    shift_snapshot jsonb DEFAULT '[]'::jsonb NOT NULL,
    published_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_schedule_publications_values CHECK (((version > 0) AND ((length(TRIM(BOTH FROM timezone)) >= 1) AND (length(TRIM(BOTH FROM timezone)) <= 80)) AND (length((snapshot_digest)::text) = 64) AND (length((request_digest)::text) = 64)))
);


--
-- Name: clinic_workforce_schedule_publications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_schedule_publications_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_schedule_publications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_schedule_publications_id_seq OWNED BY public.clinic_workforce_schedule_publications.id;


--
-- Name: clinic_workforce_schedule_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_schedule_templates (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    created_by_id bigint NOT NULL,
    name character varying NOT NULL,
    timezone character varying NOT NULL,
    shift_definitions jsonb DEFAULT '[]'::jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_schedule_templates_values CHECK ((((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120)) AND ((length(TRIM(BOTH FROM timezone)) >= 1) AND (length(TRIM(BOTH FROM timezone)) <= 80)) AND (revision > 0)))
);


--
-- Name: clinic_workforce_schedule_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_schedule_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_schedule_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_schedule_templates_id_seq OWNED BY public.clinic_workforce_schedule_templates.id;


--
-- Name: clinic_workforce_settings_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_settings_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    scope_kind character varying NOT NULL,
    site_id bigint,
    revision integer NOT NULL,
    effective_from timestamp(6) without time zone NOT NULL,
    "values" jsonb NOT NULL,
    created_by_membership_id bigint CONSTRAINT clinic_workforce_settings_ver_created_by_membership_id_not_null NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_settings_values CHECK (((revision > 0) AND (jsonb_typeof("values") = 'object'::text) AND (octet_length(("values")::text) <= 65536) AND ((((scope_kind)::text = 'practice'::text) AND (site_id IS NULL)) OR (((scope_kind)::text = 'site'::text) AND (site_id IS NOT NULL)))))
);


--
-- Name: clinic_workforce_settings_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_settings_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_settings_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_settings_versions_id_seq OWNED BY public.clinic_workforce_settings_versions.id;


--
-- Name: clinic_workforce_shift_swap_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_shift_swap_requests (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    requester_employment_id bigint CONSTRAINT clinic_workforce_shift_swap_re_requester_employment_id_not_null NOT NULL,
    target_employment_id bigint CONSTRAINT clinic_workforce_shift_swap_reque_target_employment_id_not_null NOT NULL,
    requested_by_id bigint NOT NULL,
    target_decided_by_id bigint,
    reviewed_by_id bigint,
    schedule_publication_id bigint CONSTRAINT clinic_workforce_shift_swap_re_schedule_publication_id_not_null NOT NULL,
    public_id character varying NOT NULL,
    offered_shift_public_id character varying CONSTRAINT clinic_workforce_shift_swap_re_offered_shift_public_id_not_null NOT NULL,
    status character varying NOT NULL,
    reason character varying NOT NULL,
    idempotency_key character varying NOT NULL,
    request_digest character varying NOT NULL,
    target_reason character varying,
    decision_reason character varying,
    submitted_at timestamp(6) without time zone NOT NULL,
    target_decided_at timestamp(6) without time zone,
    decided_at timestamp(6) without time zone,
    cancelled_at timestamp(6) without time zone,
    expires_at timestamp(6) without time zone,
    decision_receipts jsonb DEFAULT '{}'::jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_workforce_shift_swap_requests_digest CHECK ((length((request_digest)::text) = 64)),
    CONSTRAINT workforce_shift_swap_requests_values CHECK ((((status)::text = ANY ((ARRAY['submitted'::character varying, 'accepted'::character varying, 'declined'::character varying, 'approved'::character varying, 'denied'::character varying, 'cancelled'::character varying])::text[])) AND (requester_employment_id <> target_employment_id) AND (revision > 0) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 500)) AND ((target_reason IS NULL) OR ((length(TRIM(BOTH FROM target_reason)) >= 1) AND (length(TRIM(BOTH FROM target_reason)) <= 500))) AND ((decision_reason IS NULL) OR ((length(TRIM(BOTH FROM decision_reason)) >= 1) AND (length(TRIM(BOTH FROM decision_reason)) <= 500)))))
);


--
-- Name: clinic_workforce_shift_swap_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_shift_swap_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_shift_swap_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_shift_swap_requests_id_seq OWNED BY public.clinic_workforce_shift_swap_requests.id;


--
-- Name: clinic_workforce_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_shifts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    schedule_draft_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    public_id character varying NOT NULL,
    timezone character varying NOT NULL,
    local_start character varying NOT NULL,
    local_end character varying NOT NULL,
    start_occurrence character varying NOT NULL,
    end_occurrence character varying NOT NULL,
    starts_at timestamp(6) without time zone NOT NULL,
    ends_at timestamp(6) without time zone NOT NULL,
    role_name character varying,
    break_minutes integer DEFAULT 0 NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_shifts_values CHECK (((ends_at > starts_at) AND (break_minutes >= 0) AND ((break_minutes)::numeric < (EXTRACT(epoch FROM (ends_at - starts_at)) / (60)::numeric)) AND ((start_occurrence)::text = ANY ((ARRAY['only'::character varying, 'first'::character varying, 'second'::character varying])::text[])) AND ((end_occurrence)::text = ANY ((ARRAY['only'::character varying, 'first'::character varying, 'second'::character varying])::text[]))))
);


--
-- Name: clinic_workforce_shifts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_shifts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_shifts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_shifts_id_seq OWNED BY public.clinic_workforce_shifts.id;


--
-- Name: clinic_workforce_time_off_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_time_off_requests (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    site_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    requested_by_id bigint NOT NULL,
    reviewed_by_id bigint,
    public_id character varying NOT NULL,
    status character varying NOT NULL,
    timezone character varying NOT NULL,
    reason character varying NOT NULL,
    idempotency_key character varying NOT NULL,
    request_digest character varying NOT NULL,
    decision_reason character varying,
    starts_at timestamp(6) without time zone NOT NULL,
    ends_at timestamp(6) without time zone NOT NULL,
    submitted_at timestamp(6) without time zone NOT NULL,
    decided_at timestamp(6) without time zone,
    cancelled_at timestamp(6) without time zone,
    decision_receipts jsonb DEFAULT '{}'::jsonb NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_workforce_time_off_requests_digest CHECK ((length((request_digest)::text) = 64)),
    CONSTRAINT workforce_time_off_requests_values CHECK ((((status)::text = ANY ((ARRAY['submitted'::character varying, 'approved'::character varying, 'denied'::character varying, 'cancelled'::character varying])::text[])) AND (ends_at > starts_at) AND (revision > 0) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 500)) AND ((decision_reason IS NULL) OR ((length(TRIM(BOTH FROM decision_reason)) >= 1) AND (length(TRIM(BOTH FROM decision_reason)) <= 500)))))
);


--
-- Name: clinic_workforce_time_off_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_time_off_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_time_off_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_time_off_requests_id_seq OWNED BY public.clinic_workforce_time_off_requests.id;


--
-- Name: clinic_workforce_time_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_time_segments (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    timecard_version_id bigint NOT NULL,
    site_id bigint NOT NULL,
    segment_kind character varying NOT NULL,
    local_date date NOT NULL,
    started_at_utc timestamp(6) without time zone NOT NULL,
    ended_at_utc timestamp(6) without time zone NOT NULL,
    raw_minutes integer NOT NULL,
    rounded_minutes integer NOT NULL,
    paid_minutes integer NOT NULL,
    regular_minutes integer,
    overtime_minutes integer,
    source_punch_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    settings_provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    exception_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_time_segments_valid CHECK ((((segment_kind)::text = ANY ((ARRAY['work'::character varying, 'break'::character varying, 'manual'::character varying])::text[])) AND (ended_at_utc > started_at_utc) AND (raw_minutes >= 0) AND (rounded_minutes >= 0) AND (paid_minutes >= 0) AND ((regular_minutes IS NULL) OR (regular_minutes >= 0)) AND ((overtime_minutes IS NULL) OR (overtime_minutes >= 0)) AND (jsonb_typeof(source_punch_ids) = 'array'::text) AND (jsonb_typeof(settings_provenance) = 'object'::text) AND (jsonb_typeof(exception_codes) = 'array'::text)))
);


--
-- Name: clinic_workforce_time_segments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_time_segments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_time_segments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_time_segments_id_seq OWNED BY public.clinic_workforce_time_segments.id;


--
-- Name: clinic_workforce_timecard_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_workforce_timecard_versions (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    employment_id bigint NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    version_number integer NOT NULL,
    status character varying DEFAULT 'draft'::character varying NOT NULL,
    source_digest character varying(64) NOT NULL,
    previous_version_id bigint,
    settings_provenance jsonb DEFAULT '{}'::jsonb NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    unresolved_exceptions jsonb DEFAULT '[]'::jsonb CONSTRAINT clinic_workforce_timecard_versio_unresolved_exceptions_not_null NOT NULL,
    raw_total_minutes integer DEFAULT 0 NOT NULL,
    rounded_total_minutes integer DEFAULT 0 CONSTRAINT clinic_workforce_timecard_versio_rounded_total_minutes_not_null NOT NULL,
    regular_minutes integer,
    overtime_minutes integer,
    submitted_at timestamp(6) without time zone,
    submitted_by_membership_id bigint,
    approved_at timestamp(6) without time zone,
    approved_by_membership_id bigint,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT workforce_timecards_valid CHECK (((period_end > period_start) AND (version_number > 0) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'approved'::character varying, 'superseded'::character varying])::text[])) AND (length((source_digest)::text) = 64) AND (jsonb_typeof(settings_provenance) = 'object'::text) AND (jsonb_typeof(snapshot) = 'object'::text) AND (jsonb_typeof(unresolved_exceptions) = 'array'::text) AND (raw_total_minutes >= 0) AND (rounded_total_minutes >= 0) AND ((regular_minutes IS NULL) OR (regular_minutes >= 0)) AND ((overtime_minutes IS NULL) OR (overtime_minutes >= 0))))
);


--
-- Name: clinic_workforce_timecard_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_workforce_timecard_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_workforce_timecard_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_workforce_timecard_versions_id_seq OWNED BY public.clinic_workforce_timecard_versions.id;


--
-- Name: clinic_working_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_working_drafts (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    actor_membership_id bigint NOT NULL,
    patient_id bigint,
    encounter_id bigint,
    kind character varying(32) NOT NULL,
    context_key character varying(160) NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    encrypted_payload text,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_working_drafts_context CHECK (((version >= 0) AND ((encounter_id IS NULL) OR (patient_id IS NOT NULL))))
);


--
-- Name: clinic_working_drafts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clinic_working_drafts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clinic_working_drafts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clinic_working_drafts_id_seq OWNED BY public.clinic_working_drafts.id;


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id bigint NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    message text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: contact_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contact_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contact_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contact_messages_id_seq OWNED BY public.contact_messages.id;


--
-- Name: identity_login_throttles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_login_throttles (
    key_digest character varying(64) NOT NULL,
    attempts integer NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT identity_login_throttles_positive_attempts CHECK ((attempts > 0))
);


--
-- Name: identity_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.identity_preferences (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    palette character varying DEFAULT 'cobalt'::character varying NOT NULL,
    mode character varying DEFAULT 'light'::character varying NOT NULL,
    revision integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT identity_preferences_mode CHECK (((mode)::text = ANY ((ARRAY['system'::character varying, 'light'::character varying, 'dark'::character varying])::text[]))),
    CONSTRAINT identity_preferences_palette CHECK (((palette)::text = ANY ((ARRAY['juniper'::character varying, 'cobalt'::character varying, 'plum'::character varying, 'saffron'::character varying])::text[]))),
    CONSTRAINT identity_preferences_revision CHECK ((revision >= 0))
);


--
-- Name: identity_preferences_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.identity_preferences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: identity_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.identity_preferences_id_seq OWNED BY public.identity_preferences.id;


--
-- Name: learning_progresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_progresses (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    material_id bigint NOT NULL,
    started_at timestamp(6) without time zone NOT NULL,
    completed_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: learning_progresses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.learning_progresses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: learning_progresses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.learning_progresses_id_seq OWNED BY public.learning_progresses.id;


--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id bigint NOT NULL,
    title character varying NOT NULL,
    summary text,
    body text NOT NULL,
    published_at timestamp(6) without time zone,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    slug character varying,
    sample boolean DEFAULT false NOT NULL
);


--
-- Name: materials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.materials_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: materials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.materials_id_seq OWNED BY public.materials.id;


--
-- Name: member_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_sessions (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    expires_at timestamp(6) without time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    last_activity_at timestamp(6) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: member_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.member_sessions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: member_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.member_sessions_id_seq OWNED BY public.member_sessions.id;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id bigint NOT NULL,
    name character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organizations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organizations_id_seq OWNED BY public.organizations.id;


--
-- Name: paperworks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paperworks (
    id bigint NOT NULL,
    user_id bigint NOT NULL,
    title character varying NOT NULL,
    document_version character varying NOT NULL,
    body text NOT NULL,
    content_digest character varying NOT NULL,
    demo boolean DEFAULT true NOT NULL,
    started_at timestamp(6) without time zone,
    signed_at timestamp(6) without time zone,
    signature_name text,
    signature_digest character varying,
    consent_version character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT signed_paperwork_has_evidence CHECK (((signed_at IS NULL) OR ((started_at IS NOT NULL) AND (signature_name IS NOT NULL) AND (signature_digest IS NOT NULL))))
);


--
-- Name: paperworks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.paperworks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: paperworks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.paperworks_id_seq OWNED BY public.paperworks.id;


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id bigint NOT NULL,
    action_code character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT permissions_action_code_present CHECK ((length(TRIM(BOTH FROM action_code)) > 0))
);


--
-- Name: permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.permissions_id_seq OWNED BY public.permissions.id;


--
-- Name: platform_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_audit_events (
    id bigint NOT NULL,
    actor_session_reference character varying NOT NULL,
    action_code character varying NOT NULL,
    outcome character varying NOT NULL,
    occurred_at timestamp(6) with time zone NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT platform_audit_events_values CHECK ((length(TRIM(BOTH FROM action_code)) > 0))
);


--
-- Name: platform_audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_audit_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_audit_events_id_seq OWNED BY public.platform_audit_events.id;


--
-- Name: role_version_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_version_permissions (
    id bigint NOT NULL,
    role_version_id bigint NOT NULL,
    permission_id bigint NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: role_version_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_version_permissions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_version_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_version_permissions_id_seq OWNED BY public.role_version_permissions.id;


--
-- Name: role_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_versions (
    id bigint NOT NULL,
    role_code character varying NOT NULL,
    version integer NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT role_versions_values CHECK (((length(TRIM(BOTH FROM role_code)) > 0) AND (version > 0)))
);


--
-- Name: role_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.role_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: role_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.role_versions_id_seq OWNED BY public.role_versions.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id bigint NOT NULL,
    email_address character varying NOT NULL,
    password_digest character varying NOT NULL,
    admin boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: clinic_allergies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_allergies ALTER COLUMN id SET DEFAULT nextval('public.clinic_allergies_id_seq'::regclass);


--
-- Name: clinic_appointments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments ALTER COLUMN id SET DEFAULT nextval('public.clinic_appointments_id_seq'::regclass);


--
-- Name: clinic_audit_delivery_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_delivery_receipts ALTER COLUMN id SET DEFAULT nextval('public.clinic_audit_delivery_receipts_id_seq'::regclass);


--
-- Name: clinic_audit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_audit_events_id_seq'::regclass);


--
-- Name: clinic_audit_resource_manifests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_resource_manifests ALTER COLUMN id SET DEFAULT nextval('public.clinic_audit_resource_manifests_id_seq'::regclass);


--
-- Name: clinic_billing_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_receipts ALTER COLUMN id SET DEFAULT nextval('public.clinic_billing_receipts_id_seq'::regclass);


--
-- Name: clinic_billing_services id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_services ALTER COLUMN id SET DEFAULT nextval('public.clinic_billing_services_id_seq'::regclass);


--
-- Name: clinic_cash_drawer_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions ALTER COLUMN id SET DEFAULT nextval('public.clinic_cash_drawer_sessions_id_seq'::regclass);


--
-- Name: clinic_cash_tenders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders ALTER COLUMN id SET DEFAULT nextval('public.clinic_cash_tenders_id_seq'::regclass);


--
-- Name: clinic_clinician_assignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_assignments ALTER COLUMN id SET DEFAULT nextval('public.clinic_clinician_assignments_id_seq'::regclass);


--
-- Name: clinic_clinician_credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_credentials ALTER COLUMN id SET DEFAULT nextval('public.clinic_clinician_credentials_id_seq'::regclass);


--
-- Name: clinic_clinician_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_profiles ALTER COLUMN id SET DEFAULT nextval('public.clinic_clinician_profiles_id_seq'::regclass);


--
-- Name: clinic_communication_endpoints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_communication_endpoints ALTER COLUMN id SET DEFAULT nextval('public.clinic_communication_endpoints_id_seq'::regclass);


--
-- Name: clinic_communication_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_communication_preferences ALTER COLUMN id SET DEFAULT nextval('public.clinic_communication_preferences_id_seq'::regclass);


--
-- Name: clinic_conditions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_conditions ALTER COLUMN id SET DEFAULT nextval('public.clinic_conditions_id_seq'::regclass);


--
-- Name: clinic_coverage_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_coverage_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_coverage_versions_id_seq'::regclass);


--
-- Name: clinic_credit_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_credit_notes ALTER COLUMN id SET DEFAULT nextval('public.clinic_credit_notes_id_seq'::regclass);


--
-- Name: clinic_departments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_departments ALTER COLUMN id SET DEFAULT nextval('public.clinic_departments_id_seq'::regclass);


--
-- Name: clinic_document_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_document_categories ALTER COLUMN id SET DEFAULT nextval('public.clinic_document_categories_id_seq'::regclass);


--
-- Name: clinic_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_documents ALTER COLUMN id SET DEFAULT nextval('public.clinic_documents_id_seq'::regclass);


--
-- Name: clinic_encounter_follow_ups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups ALTER COLUMN id SET DEFAULT nextval('public.clinic_encounter_follow_ups_id_seq'::regclass);


--
-- Name: clinic_encounter_note_revisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_revisions ALTER COLUMN id SET DEFAULT nextval('public.clinic_encounter_note_revisions_id_seq'::regclass);


--
-- Name: clinic_encounter_note_signatures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_signatures ALTER COLUMN id SET DEFAULT nextval('public.clinic_encounter_note_signatures_id_seq'::regclass);


--
-- Name: clinic_encounter_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_notes ALTER COLUMN id SET DEFAULT nextval('public.clinic_encounter_notes_id_seq'::regclass);


--
-- Name: clinic_encounter_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_participants ALTER COLUMN id SET DEFAULT nextval('public.clinic_encounter_participants_id_seq'::regclass);


--
-- Name: clinic_encounter_precautions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_precautions ALTER COLUMN id SET DEFAULT nextval('public.clinic_encounter_precautions_id_seq'::regclass);


--
-- Name: clinic_encounters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounters ALTER COLUMN id SET DEFAULT nextval('public.clinic_encounters_id_seq'::regclass);


--
-- Name: clinic_insurance_claims id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_insurance_claims ALTER COLUMN id SET DEFAULT nextval('public.clinic_insurance_claims_id_seq'::regclass);


--
-- Name: clinic_inventory_catalog_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_catalog_events_id_seq'::regclass);


--
-- Name: clinic_inventory_control_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_control_reviews ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_control_reviews_id_seq'::regclass);


--
-- Name: clinic_inventory_count_approvals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_count_approvals_id_seq'::regclass);


--
-- Name: clinic_inventory_count_session_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_count_session_events_id_seq'::regclass);


--
-- Name: clinic_inventory_count_session_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_lines ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_count_session_lines_id_seq'::regclass);


--
-- Name: clinic_inventory_count_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_sessions ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_count_sessions_id_seq'::regclass);


--
-- Name: clinic_inventory_counts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_counts_id_seq'::regclass);


--
-- Name: clinic_inventory_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_entries_id_seq'::regclass);


--
-- Name: clinic_inventory_exception_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_exception_reviews ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_exception_reviews_id_seq'::regclass);


--
-- Name: clinic_inventory_hold_releases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_hold_releases_id_seq'::regclass);


--
-- Name: clinic_inventory_holds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_holds_id_seq'::regclass);


--
-- Name: clinic_inventory_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_locations ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_locations_id_seq'::regclass);


--
-- Name: clinic_inventory_lots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_lots ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_lots_id_seq'::regclass);


--
-- Name: clinic_inventory_profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_profiles ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_profiles_id_seq'::regclass);


--
-- Name: clinic_inventory_purchase_cart_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_cart_items ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_purchase_cart_items_id_seq'::regclass);


--
-- Name: clinic_inventory_purchase_carts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_carts ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_purchase_carts_id_seq'::regclass);


--
-- Name: clinic_inventory_purchase_order_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_purchase_order_events_id_seq'::regclass);


--
-- Name: clinic_inventory_purchase_order_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_lines ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_purchase_order_lines_id_seq'::regclass);


--
-- Name: clinic_inventory_purchase_orders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_orders ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_purchase_orders_id_seq'::regclass);


--
-- Name: clinic_inventory_recall_closures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_closures ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_recall_closures_id_seq'::regclass);


--
-- Name: clinic_inventory_recall_dispositions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_dispositions ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_recall_dispositions_id_seq'::regclass);


--
-- Name: clinic_inventory_recall_lots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_lots ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_recall_lots_id_seq'::regclass);


--
-- Name: clinic_inventory_recalls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recalls ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_recalls_id_seq'::regclass);


--
-- Name: clinic_inventory_receipt_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipt_lines ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_receipt_lines_id_seq'::regclass);


--
-- Name: clinic_inventory_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_receipts_id_seq'::regclass);


--
-- Name: clinic_inventory_receiving_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receiving_sessions ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_receiving_sessions_id_seq'::regclass);


--
-- Name: clinic_inventory_shipment_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_shipment_lines_id_seq'::regclass);


--
-- Name: clinic_inventory_shipment_reconciliations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_reconciliations ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_shipment_reconciliations_id_seq'::regclass);


--
-- Name: clinic_inventory_shipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipments ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_shipments_id_seq'::regclass);


--
-- Name: clinic_inventory_supplier_credits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_credits ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_supplier_credits_id_seq'::regclass);


--
-- Name: clinic_inventory_supplier_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_invoices ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_supplier_invoices_id_seq'::regclass);


--
-- Name: clinic_inventory_supplier_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_products ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_supplier_products_id_seq'::regclass);


--
-- Name: clinic_inventory_suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_suppliers ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_suppliers_id_seq'::regclass);


--
-- Name: clinic_inventory_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_transfers_id_seq'::regclass);


--
-- Name: clinic_inventory_vendor_returns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_vendor_returns ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_vendor_returns_id_seq'::regclass);


--
-- Name: clinic_invoice_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_lines ALTER COLUMN id SET DEFAULT nextval('public.clinic_invoice_lines_id_seq'::regclass);


--
-- Name: clinic_invoice_stripe_checkouts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_stripe_checkouts ALTER COLUMN id SET DEFAULT nextval('public.clinic_invoice_stripe_checkouts_id_seq'::regclass);


--
-- Name: clinic_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoices ALTER COLUMN id SET DEFAULT nextval('public.clinic_invoices_id_seq'::regclass);


--
-- Name: clinic_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_items ALTER COLUMN id SET DEFAULT nextval('public.clinic_items_id_seq'::regclass);


--
-- Name: clinic_lab_report_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_report_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_lab_report_versions_id_seq'::regclass);


--
-- Name: clinic_lab_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_reports ALTER COLUMN id SET DEFAULT nextval('public.clinic_lab_reports_id_seq'::regclass);


--
-- Name: clinic_lab_result_follow_ups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_result_follow_ups ALTER COLUMN id SET DEFAULT nextval('public.clinic_lab_result_follow_ups_id_seq'::regclass);


--
-- Name: clinic_medication_administration_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administration_movements ALTER COLUMN id SET DEFAULT nextval('public.clinic_medication_administration_movements_id_seq'::regclass);


--
-- Name: clinic_medication_administrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administrations ALTER COLUMN id SET DEFAULT nextval('public.clinic_medication_administrations_id_seq'::regclass);


--
-- Name: clinic_medication_statements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_statements ALTER COLUMN id SET DEFAULT nextval('public.clinic_medication_statements_id_seq'::regclass);


--
-- Name: clinic_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_memberships ALTER COLUMN id SET DEFAULT nextval('public.clinic_memberships_id_seq'::regclass);


--
-- Name: clinic_message_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_attachments ALTER COLUMN id SET DEFAULT nextval('public.clinic_message_attachments_id_seq'::regclass);


--
-- Name: clinic_message_delivery_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_delivery_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_message_delivery_events_id_seq'::regclass);


--
-- Name: clinic_message_intents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_intents ALTER COLUMN id SET DEFAULT nextval('public.clinic_message_intents_id_seq'::regclass);


--
-- Name: clinic_message_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_outbox ALTER COLUMN id SET DEFAULT nextval('public.clinic_message_outbox_id_seq'::regclass);


--
-- Name: clinic_model_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_model_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_model_versions_id_seq'::regclass);


--
-- Name: clinic_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes ALTER COLUMN id SET DEFAULT nextval('public.clinic_notes_id_seq'::regclass);


--
-- Name: clinic_observation_sources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observation_sources ALTER COLUMN id SET DEFAULT nextval('public.clinic_observation_sources_id_seq'::regclass);


--
-- Name: clinic_observations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observations ALTER COLUMN id SET DEFAULT nextval('public.clinic_observations_id_seq'::regclass);


--
-- Name: clinic_operation_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_operation_receipts ALTER COLUMN id SET DEFAULT nextval('public.clinic_operation_receipts_id_seq'::regclass);


--
-- Name: clinic_patient_address_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_address_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_address_versions_id_seq'::regclass);


--
-- Name: clinic_patient_care_needs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_care_needs ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_care_needs_id_seq'::regclass);


--
-- Name: clinic_patient_communication_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_communication_preferences ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_communication_preferences_id_seq'::regclass);


--
-- Name: clinic_patient_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_contacts ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_contacts_id_seq'::regclass);


--
-- Name: clinic_patient_demographics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_demographics ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_demographics_id_seq'::regclass);


--
-- Name: clinic_patient_emergency_contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_emergency_contacts ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_emergency_contacts_id_seq'::regclass);


--
-- Name: clinic_patient_history_reviews id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_history_reviews ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_history_reviews_id_seq'::regclass);


--
-- Name: clinic_patient_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_memberships ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_memberships_id_seq'::regclass);


--
-- Name: clinic_patient_portal_appointment_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_portal_appointment_requests_id_seq'::regclass);


--
-- Name: clinic_patient_portal_identities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_identities ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_portal_identities_id_seq'::regclass);


--
-- Name: clinic_patient_portal_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_requests ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_portal_requests_id_seq'::regclass);


--
-- Name: clinic_patient_reminder_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_actions ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_reminder_actions_id_seq'::regclass);


--
-- Name: clinic_patient_reminder_delivery_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_delivery_attempts ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_reminder_delivery_attempts_id_seq'::regclass);


--
-- Name: clinic_patient_reminder_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_outbox ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_reminder_outbox_id_seq'::regclass);


--
-- Name: clinic_patient_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminders ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_reminders_id_seq'::regclass);


--
-- Name: clinic_patient_social_histories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_social_histories ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_social_histories_id_seq'::regclass);


--
-- Name: clinic_patients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patients ALTER COLUMN id SET DEFAULT nextval('public.clinic_patients_id_seq'::regclass);


--
-- Name: clinic_payment_allocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_allocations ALTER COLUMN id SET DEFAULT nextval('public.clinic_payment_allocations_id_seq'::regclass);


--
-- Name: clinic_payment_collection_intents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_collection_intents ALTER COLUMN id SET DEFAULT nextval('public.clinic_payment_collection_intents_id_seq'::regclass);


--
-- Name: clinic_payment_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_payment_events_id_seq'::regclass);


--
-- Name: clinic_payment_processor_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_processor_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_payment_processor_events_id_seq'::regclass);


--
-- Name: clinic_pharmacy_batch_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batch_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_pharmacy_batch_events_id_seq'::regclass);


--
-- Name: clinic_pharmacy_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches ALTER COLUMN id SET DEFAULT nextval('public.clinic_pharmacy_batches_id_seq'::regclass);


--
-- Name: clinic_pharmacy_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_movements ALTER COLUMN id SET DEFAULT nextval('public.clinic_pharmacy_movements_id_seq'::regclass);


--
-- Name: clinic_pharmacy_products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_products ALTER COLUMN id SET DEFAULT nextval('public.clinic_pharmacy_products_id_seq'::regclass);


--
-- Name: clinic_practices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_practices ALTER COLUMN id SET DEFAULT nextval('public.clinic_practices_id_seq'::regclass);


--
-- Name: clinic_previsit_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_previsit_notes ALTER COLUMN id SET DEFAULT nextval('public.clinic_previsit_notes_id_seq'::regclass);


--
-- Name: clinic_refund_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_refund_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_refund_events_id_seq'::regclass);


--
-- Name: clinic_role_grant_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grant_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_role_grant_events_id_seq'::regclass);


--
-- Name: clinic_role_grants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grants ALTER COLUMN id SET DEFAULT nextval('public.clinic_role_grants_id_seq'::regclass);


--
-- Name: clinic_rooms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_rooms ALTER COLUMN id SET DEFAULT nextval('public.clinic_rooms_id_seq'::regclass);


--
-- Name: clinic_scribe_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_documents ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_documents_id_seq'::regclass);


--
-- Name: clinic_scribe_draft_sections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_draft_sections ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_draft_sections_id_seq'::regclass);


--
-- Name: clinic_scribe_drafts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_drafts_id_seq'::regclass);


--
-- Name: clinic_scribe_encounters id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_encounters ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_encounters_id_seq'::regclass);


--
-- Name: clinic_scribe_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_events_id_seq'::regclass);


--
-- Name: clinic_scribe_exports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_exports ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_exports_id_seq'::regclass);


--
-- Name: clinic_scribe_lab_selections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_lab_selections ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_lab_selections_id_seq'::regclass);


--
-- Name: clinic_scribe_note_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_note_templates ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_note_templates_id_seq'::regclass);


--
-- Name: clinic_scribe_recording_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recording_chunks ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_recording_chunks_id_seq'::regclass);


--
-- Name: clinic_scribe_recordings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recordings ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_recordings_id_seq'::regclass);


--
-- Name: clinic_scribe_source_segments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_source_segments ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_source_segments_id_seq'::regclass);


--
-- Name: clinic_scribe_sources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_sources ALTER COLUMN id SET DEFAULT nextval('public.clinic_scribe_sources_id_seq'::regclass);


--
-- Name: clinic_service_options id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_service_options ALTER COLUMN id SET DEFAULT nextval('public.clinic_service_options_id_seq'::regclass);


--
-- Name: clinic_site_hour_exceptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_site_hour_exceptions ALTER COLUMN id SET DEFAULT nextval('public.clinic_site_hour_exceptions_id_seq'::regclass);


--
-- Name: clinic_site_operating_hours id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_site_operating_hours ALTER COLUMN id SET DEFAULT nextval('public.clinic_site_operating_hours_id_seq'::regclass);


--
-- Name: clinic_sites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_sites ALTER COLUMN id SET DEFAULT nextval('public.clinic_sites_id_seq'::regclass);


--
-- Name: clinic_staff_address_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_address_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_address_versions_id_seq'::regclass);


--
-- Name: clinic_staff_conversation_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversation_members ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_conversation_members_id_seq'::regclass);


--
-- Name: clinic_staff_conversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversations ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_conversations_id_seq'::regclass);


--
-- Name: clinic_staff_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_members ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_members_id_seq'::regclass);


--
-- Name: clinic_staff_message_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_attachments ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_message_attachments_id_seq'::regclass);


--
-- Name: clinic_staff_message_escalations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_escalations ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_message_escalations_id_seq'::regclass);


--
-- Name: clinic_staff_message_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_outbox ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_message_outbox_id_seq'::regclass);


--
-- Name: clinic_staff_message_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_receipts ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_message_receipts_id_seq'::regclass);


--
-- Name: clinic_staff_message_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_requests ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_message_requests_id_seq'::regclass);


--
-- Name: clinic_staff_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_messages ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_messages_id_seq'::regclass);


--
-- Name: clinic_staff_notification_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notification_preferences ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_notification_preferences_id_seq'::regclass);


--
-- Name: clinic_staff_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notifications ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_notifications_id_seq'::regclass);


--
-- Name: clinic_stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements ALTER COLUMN id SET DEFAULT nextval('public.clinic_stock_movements_id_seq'::regclass);


--
-- Name: clinic_stripe_checkouts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_checkouts ALTER COLUMN id SET DEFAULT nextval('public.clinic_stripe_checkouts_id_seq'::regclass);


--
-- Name: clinic_stripe_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_connections ALTER COLUMN id SET DEFAULT nextval('public.clinic_stripe_connections_id_seq'::regclass);


--
-- Name: clinic_stripe_membership_cycles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_membership_cycles ALTER COLUMN id SET DEFAULT nextval('public.clinic_stripe_membership_cycles_id_seq'::regclass);


--
-- Name: clinic_subscription_agreements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_agreements ALTER COLUMN id SET DEFAULT nextval('public.clinic_subscription_agreements_id_seq'::regclass);


--
-- Name: clinic_subscription_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_subscription_events_id_seq'::regclass);


--
-- Name: clinic_subscription_families id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_families ALTER COLUMN id SET DEFAULT nextval('public.clinic_subscription_families_id_seq'::regclass);


--
-- Name: clinic_subscription_packages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_packages ALTER COLUMN id SET DEFAULT nextval('public.clinic_subscription_packages_id_seq'::regclass);


--
-- Name: clinic_subscription_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_subscription_versions_id_seq'::regclass);


--
-- Name: clinic_supplier_address_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_supplier_address_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_supplier_address_versions_id_seq'::regclass);


--
-- Name: clinic_telehealth_checkins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_checkins ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_checkins_id_seq'::regclass);


--
-- Name: clinic_telehealth_commands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_commands ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_commands_id_seq'::regclass);


--
-- Name: clinic_telehealth_consents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_consents ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_consents_id_seq'::regclass);


--
-- Name: clinic_telehealth_join_grants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_join_grants ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_join_grants_id_seq'::regclass);


--
-- Name: clinic_telehealth_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_participants ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_participants_id_seq'::regclass);


--
-- Name: clinic_telehealth_patient_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_patient_receipts ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_patient_receipts_id_seq'::regclass);


--
-- Name: clinic_telehealth_policy_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_policy_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_policy_versions_id_seq'::regclass);


--
-- Name: clinic_telehealth_provider_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_provider_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_provider_events_id_seq'::regclass);


--
-- Name: clinic_telehealth_room_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_room_attempts ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_room_attempts_id_seq'::regclass);


--
-- Name: clinic_telehealth_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_settings ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_settings_id_seq'::regclass);


--
-- Name: clinic_telehealth_visit_type_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visit_type_rules ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_visit_type_rules_id_seq'::regclass);


--
-- Name: clinic_telehealth_visits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_visits_id_seq'::regclass);


--
-- Name: clinic_telehealth_wrap_ups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups ALTER COLUMN id SET DEFAULT nextval('public.clinic_telehealth_wrap_ups_id_seq'::regclass);


--
-- Name: clinic_visit_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_visit_types ALTER COLUMN id SET DEFAULT nextval('public.clinic_visit_types_id_seq'::regclass);


--
-- Name: clinic_workforce_adjustment_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_adjustment_requests ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_adjustment_requests_id_seq'::regclass);


--
-- Name: clinic_workforce_availability_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_availability_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_availability_versions_id_seq'::regclass);


--
-- Name: clinic_workforce_badge_credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_badge_credentials ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_badge_credentials_id_seq'::regclass);


--
-- Name: clinic_workforce_employee_invitations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employee_invitations ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_employee_invitations_id_seq'::regclass);


--
-- Name: clinic_workforce_employment_sites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employment_sites ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_employment_sites_id_seq'::regclass);


--
-- Name: clinic_workforce_employments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employments ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_employments_id_seq'::regclass);


--
-- Name: clinic_workforce_export_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_export_batches ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_export_batches_id_seq'::regclass);


--
-- Name: clinic_workforce_kiosk_enrollments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_enrollments ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_kiosk_enrollments_id_seq'::regclass);


--
-- Name: clinic_workforce_kiosk_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_sessions ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_kiosk_sessions_id_seq'::regclass);


--
-- Name: clinic_workforce_payroll_configuration_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_payroll_configuration_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_payroll_configuration_versions_id_seq'::regclass);


--
-- Name: clinic_workforce_punch_challenges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punch_challenges ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_punch_challenges_id_seq'::regclass);


--
-- Name: clinic_workforce_punches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punches ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_punches_id_seq'::regclass);


--
-- Name: clinic_workforce_schedule_drafts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_drafts ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_schedule_drafts_id_seq'::regclass);


--
-- Name: clinic_workforce_schedule_publications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_publications ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_schedule_publications_id_seq'::regclass);


--
-- Name: clinic_workforce_schedule_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_templates ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_schedule_templates_id_seq'::regclass);


--
-- Name: clinic_workforce_settings_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_settings_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_settings_versions_id_seq'::regclass);


--
-- Name: clinic_workforce_shift_swap_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_shift_swap_requests_id_seq'::regclass);


--
-- Name: clinic_workforce_shifts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shifts ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_shifts_id_seq'::regclass);


--
-- Name: clinic_workforce_time_off_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_off_requests ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_time_off_requests_id_seq'::regclass);


--
-- Name: clinic_workforce_time_segments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_segments ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_time_segments_id_seq'::regclass);


--
-- Name: clinic_workforce_timecard_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_timecard_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_workforce_timecard_versions_id_seq'::regclass);


--
-- Name: clinic_working_drafts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_working_drafts ALTER COLUMN id SET DEFAULT nextval('public.clinic_working_drafts_id_seq'::regclass);


--
-- Name: contact_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages ALTER COLUMN id SET DEFAULT nextval('public.contact_messages_id_seq'::regclass);


--
-- Name: identity_preferences id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_preferences ALTER COLUMN id SET DEFAULT nextval('public.identity_preferences_id_seq'::regclass);


--
-- Name: learning_progresses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_progresses ALTER COLUMN id SET DEFAULT nextval('public.learning_progresses_id_seq'::regclass);


--
-- Name: materials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials ALTER COLUMN id SET DEFAULT nextval('public.materials_id_seq'::regclass);


--
-- Name: member_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_sessions ALTER COLUMN id SET DEFAULT nextval('public.member_sessions_id_seq'::regclass);


--
-- Name: organizations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations ALTER COLUMN id SET DEFAULT nextval('public.organizations_id_seq'::regclass);


--
-- Name: paperworks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paperworks ALTER COLUMN id SET DEFAULT nextval('public.paperworks_id_seq'::regclass);


--
-- Name: permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions ALTER COLUMN id SET DEFAULT nextval('public.permissions_id_seq'::regclass);


--
-- Name: platform_audit_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_events ALTER COLUMN id SET DEFAULT nextval('public.platform_audit_events_id_seq'::regclass);


--
-- Name: role_version_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_version_permissions ALTER COLUMN id SET DEFAULT nextval('public.role_version_permissions_id_seq'::regclass);


--
-- Name: role_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_versions ALTER COLUMN id SET DEFAULT nextval('public.role_versions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: ar_internal_metadata ar_internal_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_internal_metadata
    ADD CONSTRAINT ar_internal_metadata_pkey PRIMARY KEY (key);


--
-- Name: clinic_allergies clinic_allergies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_allergies
    ADD CONSTRAINT clinic_allergies_pkey PRIMARY KEY (id);


--
-- Name: clinic_appointments clinic_appointments_no_provider_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT clinic_appointments_no_provider_overlap EXCLUDE USING gist (practice_id WITH =, booked_clinician_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE (((booked_clinician_id IS NOT NULL) AND ((status)::text = ANY ((ARRAY['scheduled'::character varying, 'confirmed'::character varying])::text[]))));


--
-- Name: clinic_appointments clinic_appointments_no_room_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT clinic_appointments_no_room_overlap EXCLUDE USING gist (practice_id WITH =, room_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE (((room_id IS NOT NULL) AND ((status)::text = ANY ((ARRAY['scheduled'::character varying, 'confirmed'::character varying])::text[]))));


--
-- Name: clinic_appointments clinic_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT clinic_appointments_pkey PRIMARY KEY (id);


--
-- Name: clinic_audit_delivery_receipts clinic_audit_delivery_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_delivery_receipts
    ADD CONSTRAINT clinic_audit_delivery_receipts_pkey PRIMARY KEY (id);


--
-- Name: clinic_audit_events clinic_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_events
    ADD CONSTRAINT clinic_audit_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_audit_resource_manifests clinic_audit_resource_manifests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_resource_manifests
    ADD CONSTRAINT clinic_audit_resource_manifests_pkey PRIMARY KEY (id);


--
-- Name: clinic_billing_receipts clinic_billing_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_receipts
    ADD CONSTRAINT clinic_billing_receipts_pkey PRIMARY KEY (id);


--
-- Name: clinic_billing_services clinic_billing_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_services
    ADD CONSTRAINT clinic_billing_services_pkey PRIMARY KEY (id);


--
-- Name: clinic_cash_drawer_sessions clinic_cash_drawer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions
    ADD CONSTRAINT clinic_cash_drawer_sessions_pkey PRIMARY KEY (id);


--
-- Name: clinic_cash_tenders clinic_cash_tenders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders
    ADD CONSTRAINT clinic_cash_tenders_pkey PRIMARY KEY (id);


--
-- Name: clinic_clinician_assignments clinic_clinician_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_assignments
    ADD CONSTRAINT clinic_clinician_assignments_pkey PRIMARY KEY (id);


--
-- Name: clinic_clinician_credentials clinic_clinician_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_credentials
    ADD CONSTRAINT clinic_clinician_credentials_pkey PRIMARY KEY (id);


--
-- Name: clinic_clinician_profiles clinic_clinician_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_profiles
    ADD CONSTRAINT clinic_clinician_profiles_pkey PRIMARY KEY (id);


--
-- Name: clinic_communication_endpoints clinic_communication_endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_communication_endpoints
    ADD CONSTRAINT clinic_communication_endpoints_pkey PRIMARY KEY (id);


--
-- Name: clinic_communication_preferences clinic_communication_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_communication_preferences
    ADD CONSTRAINT clinic_communication_preferences_pkey PRIMARY KEY (id);


--
-- Name: clinic_conditions clinic_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_conditions
    ADD CONSTRAINT clinic_conditions_pkey PRIMARY KEY (id);


--
-- Name: clinic_coverage_versions clinic_coverage_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_coverage_versions
    ADD CONSTRAINT clinic_coverage_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_credit_notes clinic_credit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_credit_notes
    ADD CONSTRAINT clinic_credit_notes_pkey PRIMARY KEY (id);


--
-- Name: clinic_departments clinic_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_departments
    ADD CONSTRAINT clinic_departments_pkey PRIMARY KEY (id);


--
-- Name: clinic_document_categories clinic_document_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_document_categories
    ADD CONSTRAINT clinic_document_categories_pkey PRIMARY KEY (id);


--
-- Name: clinic_documents clinic_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_documents
    ADD CONSTRAINT clinic_documents_pkey PRIMARY KEY (id);


--
-- Name: clinic_encounter_follow_ups clinic_encounter_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT clinic_encounter_follow_ups_pkey PRIMARY KEY (id);


--
-- Name: clinic_encounter_note_revisions clinic_encounter_note_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_revisions
    ADD CONSTRAINT clinic_encounter_note_revisions_pkey PRIMARY KEY (id);


--
-- Name: clinic_encounter_note_signatures clinic_encounter_note_signatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_signatures
    ADD CONSTRAINT clinic_encounter_note_signatures_pkey PRIMARY KEY (id);


--
-- Name: clinic_encounter_notes clinic_encounter_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_notes
    ADD CONSTRAINT clinic_encounter_notes_pkey PRIMARY KEY (id);


--
-- Name: clinic_encounter_participants clinic_encounter_participants_no_overlapping_intake_owner; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_participants
    ADD CONSTRAINT clinic_encounter_participants_no_overlapping_intake_owner EXCLUDE USING gist (practice_id WITH =, encounter_id WITH =, tstzrange(effective_from, effective_until, '[)'::text) WITH &&) WHERE (((participation_role)::text = 'intake_owner'::text));


--
-- Name: clinic_encounter_participants clinic_encounter_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_participants
    ADD CONSTRAINT clinic_encounter_participants_pkey PRIMARY KEY (id);


--
-- Name: clinic_encounter_precautions clinic_encounter_precautions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_precautions
    ADD CONSTRAINT clinic_encounter_precautions_pkey PRIMARY KEY (id);


--
-- Name: clinic_encounters clinic_encounters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounters
    ADD CONSTRAINT clinic_encounters_pkey PRIMARY KEY (id);


--
-- Name: clinic_insurance_claims clinic_insurance_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_insurance_claims
    ADD CONSTRAINT clinic_insurance_claims_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_catalog_events clinic_inventory_catalog_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events
    ADD CONSTRAINT clinic_inventory_catalog_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_control_reviews clinic_inventory_control_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_control_reviews
    ADD CONSTRAINT clinic_inventory_control_reviews_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_count_approvals clinic_inventory_count_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals
    ADD CONSTRAINT clinic_inventory_count_approvals_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_count_session_events clinic_inventory_count_session_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_events
    ADD CONSTRAINT clinic_inventory_count_session_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_count_session_lines clinic_inventory_count_session_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_lines
    ADD CONSTRAINT clinic_inventory_count_session_lines_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_count_sessions clinic_inventory_count_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_sessions
    ADD CONSTRAINT clinic_inventory_count_sessions_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_counts clinic_inventory_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT clinic_inventory_counts_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_entries clinic_inventory_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT clinic_inventory_entries_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_exception_reviews clinic_inventory_exception_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_exception_reviews
    ADD CONSTRAINT clinic_inventory_exception_reviews_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_hold_releases clinic_inventory_hold_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases
    ADD CONSTRAINT clinic_inventory_hold_releases_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_holds clinic_inventory_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT clinic_inventory_holds_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_locations clinic_inventory_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_locations
    ADD CONSTRAINT clinic_inventory_locations_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_lots clinic_inventory_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_lots
    ADD CONSTRAINT clinic_inventory_lots_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_profiles clinic_inventory_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_profiles
    ADD CONSTRAINT clinic_inventory_profiles_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_purchase_cart_items clinic_inventory_purchase_cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_cart_items
    ADD CONSTRAINT clinic_inventory_purchase_cart_items_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_purchase_carts clinic_inventory_purchase_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_carts
    ADD CONSTRAINT clinic_inventory_purchase_carts_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_purchase_order_events clinic_inventory_purchase_order_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_events
    ADD CONSTRAINT clinic_inventory_purchase_order_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_purchase_order_lines clinic_inventory_purchase_order_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_lines
    ADD CONSTRAINT clinic_inventory_purchase_order_lines_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_purchase_orders clinic_inventory_purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_orders
    ADD CONSTRAINT clinic_inventory_purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_recall_closures clinic_inventory_recall_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_closures
    ADD CONSTRAINT clinic_inventory_recall_closures_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_recall_dispositions clinic_inventory_recall_dispositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_dispositions
    ADD CONSTRAINT clinic_inventory_recall_dispositions_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_recall_lots clinic_inventory_recall_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_lots
    ADD CONSTRAINT clinic_inventory_recall_lots_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_recalls clinic_inventory_recalls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recalls
    ADD CONSTRAINT clinic_inventory_recalls_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_receipt_lines clinic_inventory_receipt_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipt_lines
    ADD CONSTRAINT clinic_inventory_receipt_lines_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_receipts clinic_inventory_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT clinic_inventory_receipts_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_receiving_sessions clinic_inventory_receiving_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receiving_sessions
    ADD CONSTRAINT clinic_inventory_receiving_sessions_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_shipment_lines clinic_inventory_shipment_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines
    ADD CONSTRAINT clinic_inventory_shipment_lines_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_shipment_reconciliations clinic_inventory_shipment_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_reconciliations
    ADD CONSTRAINT clinic_inventory_shipment_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_shipments clinic_inventory_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipments
    ADD CONSTRAINT clinic_inventory_shipments_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_supplier_credits clinic_inventory_supplier_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_credits
    ADD CONSTRAINT clinic_inventory_supplier_credits_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_supplier_invoices clinic_inventory_supplier_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_invoices
    ADD CONSTRAINT clinic_inventory_supplier_invoices_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_supplier_products clinic_inventory_supplier_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_products
    ADD CONSTRAINT clinic_inventory_supplier_products_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_suppliers clinic_inventory_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_suppliers
    ADD CONSTRAINT clinic_inventory_suppliers_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_transfers clinic_inventory_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers
    ADD CONSTRAINT clinic_inventory_transfers_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_vendor_returns clinic_inventory_vendor_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_vendor_returns
    ADD CONSTRAINT clinic_inventory_vendor_returns_pkey PRIMARY KEY (id);


--
-- Name: clinic_invoice_lines clinic_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_lines
    ADD CONSTRAINT clinic_invoice_lines_pkey PRIMARY KEY (id);


--
-- Name: clinic_invoice_stripe_checkouts clinic_invoice_stripe_checkouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_stripe_checkouts
    ADD CONSTRAINT clinic_invoice_stripe_checkouts_pkey PRIMARY KEY (id);


--
-- Name: clinic_invoices clinic_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoices
    ADD CONSTRAINT clinic_invoices_pkey PRIMARY KEY (id);


--
-- Name: clinic_items clinic_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_items
    ADD CONSTRAINT clinic_items_pkey PRIMARY KEY (id);


--
-- Name: clinic_lab_report_versions clinic_lab_report_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_report_versions
    ADD CONSTRAINT clinic_lab_report_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_lab_reports clinic_lab_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_reports
    ADD CONSTRAINT clinic_lab_reports_pkey PRIMARY KEY (id);


--
-- Name: clinic_lab_result_follow_ups clinic_lab_result_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_result_follow_ups
    ADD CONSTRAINT clinic_lab_result_follow_ups_pkey PRIMARY KEY (id);


--
-- Name: clinic_medication_administration_movements clinic_medication_administration_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administration_movements
    ADD CONSTRAINT clinic_medication_administration_movements_pkey PRIMARY KEY (id);


--
-- Name: clinic_medication_administrations clinic_medication_administrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administrations
    ADD CONSTRAINT clinic_medication_administrations_pkey PRIMARY KEY (id);


--
-- Name: clinic_medication_statements clinic_medication_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_statements
    ADD CONSTRAINT clinic_medication_statements_pkey PRIMARY KEY (id);


--
-- Name: clinic_memberships clinic_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_memberships
    ADD CONSTRAINT clinic_memberships_pkey PRIMARY KEY (id);


--
-- Name: clinic_message_attachments clinic_message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_attachments
    ADD CONSTRAINT clinic_message_attachments_pkey PRIMARY KEY (id);


--
-- Name: clinic_message_delivery_events clinic_message_delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_delivery_events
    ADD CONSTRAINT clinic_message_delivery_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_message_intents clinic_message_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_intents
    ADD CONSTRAINT clinic_message_intents_pkey PRIMARY KEY (id);


--
-- Name: clinic_message_outbox clinic_message_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_outbox
    ADD CONSTRAINT clinic_message_outbox_pkey PRIMARY KEY (id);


--
-- Name: clinic_model_versions clinic_model_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_model_versions
    ADD CONSTRAINT clinic_model_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_notes clinic_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes
    ADD CONSTRAINT clinic_notes_pkey PRIMARY KEY (id);


--
-- Name: clinic_observation_sources clinic_observation_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observation_sources
    ADD CONSTRAINT clinic_observation_sources_pkey PRIMARY KEY (id);


--
-- Name: clinic_observations clinic_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observations
    ADD CONSTRAINT clinic_observations_pkey PRIMARY KEY (id);


--
-- Name: clinic_operation_receipts clinic_operation_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_operation_receipts
    ADD CONSTRAINT clinic_operation_receipts_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_address_versions clinic_patient_address_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_address_versions
    ADD CONSTRAINT clinic_patient_address_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_care_needs clinic_patient_care_needs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_care_needs
    ADD CONSTRAINT clinic_patient_care_needs_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_communication_preferences clinic_patient_communication_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_communication_preferences
    ADD CONSTRAINT clinic_patient_communication_preferences_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_contacts clinic_patient_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_contacts
    ADD CONSTRAINT clinic_patient_contacts_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_demographics clinic_patient_demographics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_demographics
    ADD CONSTRAINT clinic_patient_demographics_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_emergency_contacts clinic_patient_emergency_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_emergency_contacts
    ADD CONSTRAINT clinic_patient_emergency_contacts_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_history_reviews clinic_patient_history_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_history_reviews
    ADD CONSTRAINT clinic_patient_history_reviews_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_memberships clinic_patient_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_memberships
    ADD CONSTRAINT clinic_patient_memberships_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_portal_appointment_requests clinic_patient_portal_appointment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT clinic_patient_portal_appointment_requests_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_portal_identities clinic_patient_portal_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_identities
    ADD CONSTRAINT clinic_patient_portal_identities_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_portal_requests clinic_patient_portal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_requests
    ADD CONSTRAINT clinic_patient_portal_requests_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_reminder_actions clinic_patient_reminder_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_actions
    ADD CONSTRAINT clinic_patient_reminder_actions_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_reminder_delivery_attempts clinic_patient_reminder_delivery_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_delivery_attempts
    ADD CONSTRAINT clinic_patient_reminder_delivery_attempts_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_reminder_outbox clinic_patient_reminder_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_outbox
    ADD CONSTRAINT clinic_patient_reminder_outbox_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_reminders clinic_patient_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminders
    ADD CONSTRAINT clinic_patient_reminders_pkey PRIMARY KEY (id);


--
-- Name: clinic_patient_social_histories clinic_patient_social_histories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_social_histories
    ADD CONSTRAINT clinic_patient_social_histories_pkey PRIMARY KEY (id);


--
-- Name: clinic_patients clinic_patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patients
    ADD CONSTRAINT clinic_patients_pkey PRIMARY KEY (id);


--
-- Name: clinic_payment_allocations clinic_payment_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_allocations
    ADD CONSTRAINT clinic_payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: clinic_payment_collection_intents clinic_payment_collection_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_collection_intents
    ADD CONSTRAINT clinic_payment_collection_intents_pkey PRIMARY KEY (id);


--
-- Name: clinic_payment_events clinic_payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_events
    ADD CONSTRAINT clinic_payment_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_payment_processor_events clinic_payment_processor_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_processor_events
    ADD CONSTRAINT clinic_payment_processor_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_pharmacy_batch_events clinic_pharmacy_batch_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batch_events
    ADD CONSTRAINT clinic_pharmacy_batch_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_pharmacy_batches clinic_pharmacy_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches
    ADD CONSTRAINT clinic_pharmacy_batches_pkey PRIMARY KEY (id);


--
-- Name: clinic_pharmacy_movements clinic_pharmacy_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_movements
    ADD CONSTRAINT clinic_pharmacy_movements_pkey PRIMARY KEY (id);


--
-- Name: clinic_pharmacy_products clinic_pharmacy_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_products
    ADD CONSTRAINT clinic_pharmacy_products_pkey PRIMARY KEY (id);


--
-- Name: clinic_practices clinic_practices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_practices
    ADD CONSTRAINT clinic_practices_pkey PRIMARY KEY (id);


--
-- Name: clinic_previsit_notes clinic_previsit_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_previsit_notes
    ADD CONSTRAINT clinic_previsit_notes_pkey PRIMARY KEY (id);


--
-- Name: clinic_refund_events clinic_refund_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_refund_events
    ADD CONSTRAINT clinic_refund_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_role_grant_events clinic_role_grant_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grant_events
    ADD CONSTRAINT clinic_role_grant_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_role_grants clinic_role_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grants
    ADD CONSTRAINT clinic_role_grants_pkey PRIMARY KEY (id);


--
-- Name: clinic_rooms clinic_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_rooms
    ADD CONSTRAINT clinic_rooms_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_documents clinic_scribe_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_documents
    ADD CONSTRAINT clinic_scribe_documents_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_draft_sections clinic_scribe_draft_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_draft_sections
    ADD CONSTRAINT clinic_scribe_draft_sections_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_drafts clinic_scribe_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts
    ADD CONSTRAINT clinic_scribe_drafts_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_encounters clinic_scribe_encounters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_encounters
    ADD CONSTRAINT clinic_scribe_encounters_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_events clinic_scribe_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_events
    ADD CONSTRAINT clinic_scribe_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_exports clinic_scribe_exports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_exports
    ADD CONSTRAINT clinic_scribe_exports_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_lab_selections clinic_scribe_lab_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_lab_selections
    ADD CONSTRAINT clinic_scribe_lab_selections_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_note_templates clinic_scribe_note_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_note_templates
    ADD CONSTRAINT clinic_scribe_note_templates_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_recording_chunks clinic_scribe_recording_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recording_chunks
    ADD CONSTRAINT clinic_scribe_recording_chunks_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_recordings clinic_scribe_recordings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recordings
    ADD CONSTRAINT clinic_scribe_recordings_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_source_segments clinic_scribe_source_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_source_segments
    ADD CONSTRAINT clinic_scribe_source_segments_pkey PRIMARY KEY (id);


--
-- Name: clinic_scribe_sources clinic_scribe_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_sources
    ADD CONSTRAINT clinic_scribe_sources_pkey PRIMARY KEY (id);


--
-- Name: clinic_service_options clinic_service_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_service_options
    ADD CONSTRAINT clinic_service_options_pkey PRIMARY KEY (id);


--
-- Name: clinic_site_hour_exceptions clinic_site_hour_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_site_hour_exceptions
    ADD CONSTRAINT clinic_site_hour_exceptions_pkey PRIMARY KEY (id);


--
-- Name: clinic_site_operating_hours clinic_site_operating_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_site_operating_hours
    ADD CONSTRAINT clinic_site_operating_hours_pkey PRIMARY KEY (id);


--
-- Name: clinic_sites clinic_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_sites
    ADD CONSTRAINT clinic_sites_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_address_versions clinic_staff_address_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_address_versions
    ADD CONSTRAINT clinic_staff_address_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_conversation_members clinic_staff_conversation_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversation_members
    ADD CONSTRAINT clinic_staff_conversation_members_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_conversations clinic_staff_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversations
    ADD CONSTRAINT clinic_staff_conversations_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_members clinic_staff_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_members
    ADD CONSTRAINT clinic_staff_members_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_message_attachments clinic_staff_message_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_attachments
    ADD CONSTRAINT clinic_staff_message_attachments_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_message_escalations clinic_staff_message_escalations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_escalations
    ADD CONSTRAINT clinic_staff_message_escalations_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_message_outbox clinic_staff_message_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_outbox
    ADD CONSTRAINT clinic_staff_message_outbox_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_message_receipts clinic_staff_message_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_receipts
    ADD CONSTRAINT clinic_staff_message_receipts_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_message_requests clinic_staff_message_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_requests
    ADD CONSTRAINT clinic_staff_message_requests_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_messages clinic_staff_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_messages
    ADD CONSTRAINT clinic_staff_messages_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_notification_preferences clinic_staff_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notification_preferences
    ADD CONSTRAINT clinic_staff_notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: clinic_staff_notifications clinic_staff_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notifications
    ADD CONSTRAINT clinic_staff_notifications_pkey PRIMARY KEY (id);


--
-- Name: clinic_stock_movements clinic_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements
    ADD CONSTRAINT clinic_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: clinic_stripe_checkouts clinic_stripe_checkouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_checkouts
    ADD CONSTRAINT clinic_stripe_checkouts_pkey PRIMARY KEY (id);


--
-- Name: clinic_stripe_connections clinic_stripe_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_connections
    ADD CONSTRAINT clinic_stripe_connections_pkey PRIMARY KEY (id);


--
-- Name: clinic_stripe_membership_cycles clinic_stripe_membership_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_membership_cycles
    ADD CONSTRAINT clinic_stripe_membership_cycles_pkey PRIMARY KEY (id);


--
-- Name: clinic_subscription_agreements clinic_subscription_agreements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_agreements
    ADD CONSTRAINT clinic_subscription_agreements_pkey PRIMARY KEY (id);


--
-- Name: clinic_subscription_events clinic_subscription_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_events
    ADD CONSTRAINT clinic_subscription_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_subscription_families clinic_subscription_families_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_families
    ADD CONSTRAINT clinic_subscription_families_pkey PRIMARY KEY (id);


--
-- Name: clinic_subscription_packages clinic_subscription_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_packages
    ADD CONSTRAINT clinic_subscription_packages_pkey PRIMARY KEY (id);


--
-- Name: clinic_subscription_versions clinic_subscription_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_versions
    ADD CONSTRAINT clinic_subscription_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_supplier_address_versions clinic_supplier_address_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_supplier_address_versions
    ADD CONSTRAINT clinic_supplier_address_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_checkins clinic_telehealth_checkins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_checkins
    ADD CONSTRAINT clinic_telehealth_checkins_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_commands clinic_telehealth_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_commands
    ADD CONSTRAINT clinic_telehealth_commands_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_consents clinic_telehealth_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_consents
    ADD CONSTRAINT clinic_telehealth_consents_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_join_grants clinic_telehealth_join_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_join_grants
    ADD CONSTRAINT clinic_telehealth_join_grants_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_participants clinic_telehealth_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_participants
    ADD CONSTRAINT clinic_telehealth_participants_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_patient_receipts clinic_telehealth_patient_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_patient_receipts
    ADD CONSTRAINT clinic_telehealth_patient_receipts_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_policy_versions clinic_telehealth_policy_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_policy_versions
    ADD CONSTRAINT clinic_telehealth_policy_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_provider_events clinic_telehealth_provider_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_provider_events
    ADD CONSTRAINT clinic_telehealth_provider_events_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_room_attempts clinic_telehealth_room_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_room_attempts
    ADD CONSTRAINT clinic_telehealth_room_attempts_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_settings clinic_telehealth_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_settings
    ADD CONSTRAINT clinic_telehealth_settings_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_visit_type_rules clinic_telehealth_visit_type_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visit_type_rules
    ADD CONSTRAINT clinic_telehealth_visit_type_rules_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_visits clinic_telehealth_visits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT clinic_telehealth_visits_pkey PRIMARY KEY (id);


--
-- Name: clinic_telehealth_wrap_ups clinic_telehealth_wrap_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT clinic_telehealth_wrap_ups_pkey PRIMARY KEY (id);


--
-- Name: clinic_visit_types clinic_visit_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_visit_types
    ADD CONSTRAINT clinic_visit_types_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_adjustment_requests clinic_workforce_adjustment_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_adjustment_requests
    ADD CONSTRAINT clinic_workforce_adjustment_requests_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_availability_versions clinic_workforce_availability_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_availability_versions
    ADD CONSTRAINT clinic_workforce_availability_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_badge_credentials clinic_workforce_badge_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_badge_credentials
    ADD CONSTRAINT clinic_workforce_badge_credentials_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_employee_invitations clinic_workforce_employee_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employee_invitations
    ADD CONSTRAINT clinic_workforce_employee_invitations_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_employment_sites clinic_workforce_employment_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employment_sites
    ADD CONSTRAINT clinic_workforce_employment_sites_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_employments clinic_workforce_employments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employments
    ADD CONSTRAINT clinic_workforce_employments_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_export_batches clinic_workforce_export_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_export_batches
    ADD CONSTRAINT clinic_workforce_export_batches_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_kiosk_enrollments clinic_workforce_kiosk_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_enrollments
    ADD CONSTRAINT clinic_workforce_kiosk_enrollments_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_kiosk_sessions clinic_workforce_kiosk_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_sessions
    ADD CONSTRAINT clinic_workforce_kiosk_sessions_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_payroll_configuration_versions clinic_workforce_payroll_configuration_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_payroll_configuration_versions
    ADD CONSTRAINT clinic_workforce_payroll_configuration_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_punch_challenges clinic_workforce_punch_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punch_challenges
    ADD CONSTRAINT clinic_workforce_punch_challenges_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_punches clinic_workforce_punches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punches
    ADD CONSTRAINT clinic_workforce_punches_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_schedule_drafts clinic_workforce_schedule_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_drafts
    ADD CONSTRAINT clinic_workforce_schedule_drafts_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_schedule_publications clinic_workforce_schedule_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_publications
    ADD CONSTRAINT clinic_workforce_schedule_publications_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_schedule_templates clinic_workforce_schedule_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_templates
    ADD CONSTRAINT clinic_workforce_schedule_templates_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_settings_versions clinic_workforce_settings_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_settings_versions
    ADD CONSTRAINT clinic_workforce_settings_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_shift_swap_requests clinic_workforce_shift_swap_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT clinic_workforce_shift_swap_requests_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_shifts clinic_workforce_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shifts
    ADD CONSTRAINT clinic_workforce_shifts_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_time_off_requests clinic_workforce_time_off_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_off_requests
    ADD CONSTRAINT clinic_workforce_time_off_requests_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_time_segments clinic_workforce_time_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_segments
    ADD CONSTRAINT clinic_workforce_time_segments_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_timecard_versions clinic_workforce_timecard_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_timecard_versions
    ADD CONSTRAINT clinic_workforce_timecard_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_working_drafts clinic_working_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_working_drafts
    ADD CONSTRAINT clinic_working_drafts_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: identity_login_throttles identity_login_throttles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_login_throttles
    ADD CONSTRAINT identity_login_throttles_pkey PRIMARY KEY (key_digest);


--
-- Name: identity_preferences identity_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_preferences
    ADD CONSTRAINT identity_preferences_pkey PRIMARY KEY (id);


--
-- Name: learning_progresses learning_progresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_progresses
    ADD CONSTRAINT learning_progresses_pkey PRIMARY KEY (id);


--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--
-- Name: member_sessions member_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_sessions
    ADD CONSTRAINT member_sessions_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: paperworks paperworks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paperworks
    ADD CONSTRAINT paperworks_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: platform_audit_events platform_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_audit_events
    ADD CONSTRAINT platform_audit_events_pkey PRIMARY KEY (id);


--
-- Name: role_version_permissions role_version_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_version_permissions
    ADD CONSTRAINT role_version_permissions_pkey PRIMARY KEY (id);


--
-- Name: role_versions role_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_versions
    ADD CONSTRAINT role_versions_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: clinic_workforce_employment_sites workforce_assignment_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employment_sites
    ADD CONSTRAINT workforce_assignment_no_overlap EXCLUDE USING gist (practice_id WITH =, employment_id WITH =, site_id WITH =, tsrange(effective_from, effective_until, '[)'::text) WITH &&);


--
-- Name: cash_drawer_reconciliation_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cash_drawer_reconciliation_request ON public.clinic_cash_drawer_sessions USING btree (practice_id, reconciliation_request_key) WHERE (reconciliation_request_key IS NOT NULL);


--
-- Name: clinic_allergies_patient_data_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_allergies_patient_data_status ON public.clinic_allergies USING btree (practice_id, patient_id, data_status);


--
-- Name: clinic_allergies_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_allergies_patient_time ON public.clinic_allergies USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_allergies_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_allergies_practice_id ON public.clinic_allergies USING btree (practice_id, id);


--
-- Name: clinic_allergies_recorded_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_allergies_recorded_by_membership_id_fk ON public.clinic_allergies USING btree (practice_id, recorded_by_membership_id);


--
-- Name: clinic_allergies_reviewed_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_allergies_reviewed_by_membership_id_fk ON public.clinic_allergies USING btree (practice_id, reviewed_by_membership_id);


--
-- Name: clinic_appointments_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_appointments_practice_id ON public.clinic_appointments USING btree (practice_id, id);


--
-- Name: clinic_appointments_practice_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_appointments_practice_patient_id ON public.clinic_appointments USING btree (practice_id, patient_id, id);


--
-- Name: clinic_assignments_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_assignments_identity ON public.clinic_clinician_assignments USING btree (practice_id, clinician_profile_id, department_id, site_id, effective_from);


--
-- Name: clinic_audit_delivery_receipts_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_audit_delivery_receipts_practice_id ON public.clinic_audit_delivery_receipts USING btree (practice_id, id);


--
-- Name: clinic_audit_events_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_audit_events_practice_id ON public.clinic_audit_events USING btree (practice_id, id);


--
-- Name: clinic_audit_events_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_audit_events_time ON public.clinic_audit_events USING btree (practice_id, occurred_at, id);


--
-- Name: clinic_audit_manifests_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_audit_manifests_identity ON public.clinic_audit_resource_manifests USING btree (practice_id, audit_event_id, protected_resource_version_ref);


--
-- Name: clinic_audit_receipts_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_audit_receipts_identity ON public.clinic_audit_delivery_receipts USING btree (practice_id, audit_event_id, sink_receipt_reference);


--
-- Name: clinic_audit_resource_manifests_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_audit_resource_manifests_practice_id ON public.clinic_audit_resource_manifests USING btree (practice_id, id);


--
-- Name: clinic_billing_services_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_billing_services_code ON public.clinic_billing_services USING btree (practice_id, code) WHERE (code IS NOT NULL);


--
-- Name: clinic_billing_services_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_billing_services_name ON public.clinic_billing_services USING btree (practice_id, name);


--
-- Name: clinic_billing_services_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_billing_services_practice_id ON public.clinic_billing_services USING btree (practice_id, id);


--
-- Name: clinic_care_needs_active_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_care_needs_active_lookup ON public.clinic_patient_care_needs USING btree (practice_id, patient_id, status, category);


--
-- Name: clinic_cash_drawer_one_open_per_site; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_cash_drawer_one_open_per_site ON public.clinic_cash_drawer_sessions USING btree (practice_id, site_id) WHERE ((status)::text = 'open'::text);


--
-- Name: clinic_cash_tenders_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_cash_tenders_request_key ON public.clinic_cash_tenders USING btree (practice_id, request_key);


--
-- Name: clinic_clinician_assignments_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_clinician_assignments_practice_id ON public.clinic_clinician_assignments USING btree (practice_id, id);


--
-- Name: clinic_clinician_credentials_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_clinician_credentials_practice_id ON public.clinic_clinician_credentials USING btree (practice_id, id);


--
-- Name: clinic_clinician_profiles_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_clinician_profiles_practice_id ON public.clinic_clinician_profiles USING btree (practice_id, id);


--
-- Name: clinic_clinician_profiles_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_clinician_profiles_reference ON public.clinic_clinician_profiles USING btree (practice_id, reference) WHERE (reference IS NOT NULL);


--
-- Name: clinic_communication_endpoints_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_communication_endpoints_identity ON public.clinic_communication_endpoints USING btree (practice_id, patient_id, value_digest);


--
-- Name: clinic_communication_endpoints_patient_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_communication_endpoints_patient_type ON public.clinic_communication_endpoints USING btree (practice_id, patient_id, endpoint_type);


--
-- Name: clinic_communication_endpoints_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_communication_endpoints_practice_id ON public.clinic_communication_endpoints USING btree (practice_id, id);


--
-- Name: clinic_communication_preferences_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_communication_preferences_version ON public.clinic_communication_preferences USING btree (practice_id, patient_id, category, channel, version);


--
-- Name: clinic_conditions_patient_data_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_conditions_patient_data_status ON public.clinic_conditions USING btree (practice_id, patient_id, data_status);


--
-- Name: clinic_conditions_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_conditions_patient_time ON public.clinic_conditions USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_conditions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_conditions_practice_id ON public.clinic_conditions USING btree (practice_id, id);


--
-- Name: clinic_conditions_recorded_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_conditions_recorded_by_membership_id_fk ON public.clinic_conditions USING btree (practice_id, recorded_by_membership_id);


--
-- Name: clinic_conditions_reviewed_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_conditions_reviewed_by_membership_id_fk ON public.clinic_conditions USING btree (practice_id, reviewed_by_membership_id);


--
-- Name: clinic_coverage_versions_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_coverage_versions_identity ON public.clinic_coverage_versions USING btree (practice_id, patient_id, version);


--
-- Name: clinic_coverage_versions_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_coverage_versions_patient_id ON public.clinic_coverage_versions USING btree (practice_id, patient_id, id);


--
-- Name: clinic_coverage_versions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_coverage_versions_practice_id ON public.clinic_coverage_versions USING btree (practice_id, id);


--
-- Name: clinic_credit_notes_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_credit_notes_practice_id ON public.clinic_credit_notes USING btree (practice_id, id);


--
-- Name: clinic_departments_practice_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_departments_practice_code ON public.clinic_departments USING btree (practice_id, code);


--
-- Name: clinic_departments_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_departments_practice_id ON public.clinic_departments USING btree (practice_id, id);


--
-- Name: clinic_document_categories_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_document_categories_code ON public.clinic_document_categories USING btree (practice_id, code);


--
-- Name: clinic_document_categories_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_document_categories_practice_id ON public.clinic_document_categories USING btree (practice_id, id);


--
-- Name: clinic_documents_object_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_documents_object_identity ON public.clinic_documents USING btree (practice_id, object_key, object_version);


--
-- Name: clinic_documents_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_documents_patient_id ON public.clinic_documents USING btree (practice_id, patient_id, id);


--
-- Name: clinic_documents_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_documents_practice_id ON public.clinic_documents USING btree (practice_id, id);


--
-- Name: clinic_encounter_note_revisions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounter_note_revisions_practice_id ON public.clinic_encounter_note_revisions USING btree (practice_id, id);


--
-- Name: clinic_encounter_note_signatures_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounter_note_signatures_practice_id ON public.clinic_encounter_note_signatures USING btree (practice_id, id);


--
-- Name: clinic_encounter_notes_one_soap; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounter_notes_one_soap ON public.clinic_encounter_notes USING btree (practice_id, encounter_id, note_kind) WHERE ((note_kind)::text = 'soap'::text);


--
-- Name: clinic_encounter_notes_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounter_notes_practice_id ON public.clinic_encounter_notes USING btree (practice_id, id);


--
-- Name: clinic_encounter_participants_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounter_participants_practice_id ON public.clinic_encounter_participants USING btree (practice_id, id);


--
-- Name: clinic_encounter_precautions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounter_precautions_practice_id ON public.clinic_encounter_precautions USING btree (practice_id, id);


--
-- Name: clinic_encounter_precautions_reassessed_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_encounter_precautions_reassessed_by_membership_id_fk ON public.clinic_encounter_precautions USING btree (practice_id, reassessed_by_membership_id);


--
-- Name: clinic_encounter_precautions_recorded_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_encounter_precautions_recorded_by_membership_id_fk ON public.clinic_encounter_precautions USING btree (practice_id, recorded_by_membership_id);


--
-- Name: clinic_encounters_one_per_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounters_one_per_appointment ON public.clinic_encounters USING btree (practice_id, appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: clinic_encounters_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounters_practice_id ON public.clinic_encounters USING btree (practice_id, id);


--
-- Name: clinic_encounters_practice_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_encounters_practice_patient_id ON public.clinic_encounters USING btree (practice_id, patient_id, id);


--
-- Name: clinic_history_reviews_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_history_reviews_latest ON public.clinic_patient_history_reviews USING btree (practice_id, patient_id, encounter_id, topic, reviewed_at);


--
-- Name: clinic_history_reviews_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_history_reviews_request_key ON public.clinic_patient_history_reviews USING btree (practice_id, request_key);


--
-- Name: clinic_insurance_claims_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_insurance_claims_practice_id ON public.clinic_insurance_claims USING btree (practice_id, id);


--
-- Name: clinic_invoice_lines_billing_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_invoice_lines_billing_service ON public.clinic_invoice_lines USING btree (practice_id, billing_service_id);


--
-- Name: clinic_invoice_lines_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_invoice_lines_practice_id ON public.clinic_invoice_lines USING btree (practice_id, id);


--
-- Name: clinic_invoices_one_active_per_encounter; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_invoices_one_active_per_encounter ON public.clinic_invoices USING btree (practice_id, encounter_id) WHERE ((encounter_id IS NOT NULL) AND ((status)::text <> 'void'::text));


--
-- Name: clinic_invoices_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_invoices_patient_id ON public.clinic_invoices USING btree (practice_id, patient_id, id);


--
-- Name: clinic_invoices_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_invoices_practice_id ON public.clinic_invoices USING btree (practice_id, id);


--
-- Name: clinic_lab_follow_ups_open_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_lab_follow_ups_open_queue ON public.clinic_lab_result_follow_ups USING btree (practice_id, state, recorded_at, id) WHERE ((state)::text = 'open'::text);


--
-- Name: clinic_lab_follow_ups_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_lab_follow_ups_practice_id ON public.clinic_lab_result_follow_ups USING btree (practice_id, id);


--
-- Name: clinic_lab_follow_ups_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_lab_follow_ups_version_id ON public.clinic_lab_result_follow_ups USING btree (practice_id, patient_id, lab_report_id, lab_report_version_id);


--
-- Name: clinic_lab_report_versions_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_lab_report_versions_number ON public.clinic_lab_report_versions USING btree (practice_id, lab_report_id, version_number);


--
-- Name: clinic_lab_report_versions_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_lab_report_versions_patient_id ON public.clinic_lab_report_versions USING btree (practice_id, patient_id, id);


--
-- Name: clinic_lab_report_versions_report_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_lab_report_versions_report_id ON public.clinic_lab_report_versions USING btree (practice_id, patient_id, lab_report_id, id);


--
-- Name: clinic_lab_reports_external_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_lab_reports_external_identity ON public.clinic_lab_reports USING btree (practice_id, patient_id, external_report_id_digest) WHERE (external_report_id_digest IS NOT NULL);


--
-- Name: clinic_lab_reports_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_lab_reports_patient_id ON public.clinic_lab_reports USING btree (practice_id, patient_id, id);


--
-- Name: clinic_lab_reports_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_lab_reports_practice_id ON public.clinic_lab_reports USING btree (practice_id, id);


--
-- Name: clinic_medication_admin_movements_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_medication_admin_movements_entry ON public.clinic_medication_administration_movements USING btree (practice_id, inventory_entry_id);


--
-- Name: clinic_medication_admin_movements_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_medication_admin_movements_identity ON public.clinic_medication_administration_movements USING btree (practice_id, medication_administration_id, inventory_entry_id);


--
-- Name: clinic_medication_admin_movements_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_medication_admin_movements_practice_id ON public.clinic_medication_administration_movements USING btree (practice_id, id);


--
-- Name: clinic_medication_administrations_encounter_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_medication_administrations_encounter_timeline ON public.clinic_medication_administrations USING btree (practice_id, patient_id, encounter_id, administered_at, id);


--
-- Name: clinic_medication_administrations_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_medication_administrations_practice_id ON public.clinic_medication_administrations USING btree (practice_id, id);


--
-- Name: clinic_medication_administrations_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_medication_administrations_retry ON public.clinic_medication_administrations USING btree (practice_id, request_key);


--
-- Name: clinic_medication_statements_patient_data_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_medication_statements_patient_data_status ON public.clinic_medication_statements USING btree (practice_id, patient_id, data_status);


--
-- Name: clinic_medication_statements_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_medication_statements_patient_time ON public.clinic_medication_statements USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_medication_statements_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_medication_statements_practice_id ON public.clinic_medication_statements USING btree (practice_id, id);


--
-- Name: clinic_medication_statements_recorded_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_medication_statements_recorded_by_membership_id_fk ON public.clinic_medication_statements USING btree (practice_id, recorded_by_membership_id);


--
-- Name: clinic_medication_statements_reviewed_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_medication_statements_reviewed_by_membership_id_fk ON public.clinic_medication_statements USING btree (practice_id, reviewed_by_membership_id);


--
-- Name: clinic_memberships_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_memberships_practice_id ON public.clinic_memberships USING btree (practice_id, id);


--
-- Name: clinic_message_attachments_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_attachments_identity ON public.clinic_message_attachments USING btree (practice_id, message_intent_id, document_id);


--
-- Name: clinic_message_attachments_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_attachments_practice_id ON public.clinic_message_attachments USING btree (practice_id, id);


--
-- Name: clinic_message_delivery_events_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_delivery_events_practice_id ON public.clinic_message_delivery_events USING btree (practice_id, id);


--
-- Name: clinic_message_delivery_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_delivery_identity ON public.clinic_message_delivery_events USING btree (practice_id, message_intent_id, provider_event_reference);


--
-- Name: clinic_message_intents_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_intents_patient_id ON public.clinic_message_intents USING btree (practice_id, patient_id, id);


--
-- Name: clinic_message_intents_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_intents_practice_id ON public.clinic_message_intents USING btree (practice_id, id);


--
-- Name: clinic_message_intents_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_intents_request ON public.clinic_message_intents USING btree (practice_id, request_key);


--
-- Name: clinic_message_outbox_one_per_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_outbox_one_per_intent ON public.clinic_message_outbox USING btree (practice_id, message_intent_id);


--
-- Name: clinic_message_outbox_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_message_outbox_practice_id ON public.clinic_message_outbox USING btree (practice_id, id);


--
-- Name: clinic_model_versions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_model_versions_practice_id ON public.clinic_model_versions USING btree (practice_id, id);


--
-- Name: clinic_model_versions_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_model_versions_request ON public.clinic_model_versions USING btree (practice_id, request_id, id);


--
-- Name: clinic_model_versions_subject_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_model_versions_subject_time ON public.clinic_model_versions USING btree (practice_id, item_type, item_id, occurred_at, id);


--
-- Name: clinic_note_revisions_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_note_revisions_number ON public.clinic_encounter_note_revisions USING btree (practice_id, note_id, revision_no);


--
-- Name: clinic_note_revisions_practice_note_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_note_revisions_practice_note_id ON public.clinic_encounter_note_revisions USING btree (practice_id, note_id, id);


--
-- Name: clinic_note_signatures_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_note_signatures_identity ON public.clinic_encounter_note_signatures USING btree (practice_id, note_id, revision_id, signer_membership_id);


--
-- Name: clinic_observation_sources_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_observation_sources_identity ON public.clinic_observation_sources USING btree (practice_id, derived_observation_id, source_observation_id);


--
-- Name: clinic_observation_sources_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_observation_sources_practice_id ON public.clinic_observation_sources USING btree (practice_id, id);


--
-- Name: clinic_observations_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_observations_patient_id ON public.clinic_observations USING btree (practice_id, patient_id, id);


--
-- Name: clinic_observations_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_observations_patient_time ON public.clinic_observations USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_observations_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_observations_practice_id ON public.clinic_observations USING btree (practice_id, id);


--
-- Name: clinic_observations_value_binding; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_observations_value_binding ON public.clinic_observations USING btree (practice_id, value_binding_id);


--
-- Name: clinic_operation_receipts_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_operation_receipts_identity ON public.clinic_operation_receipts USING btree (practice_id, actor_membership_id, request_key);


--
-- Name: clinic_operation_receipts_operation_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_operation_receipts_operation_time ON public.clinic_operation_receipts USING btree (practice_id, operation_code, created_at);


--
-- Name: clinic_operation_receipts_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_operation_receipts_practice_id ON public.clinic_operation_receipts USING btree (practice_id, id);


--
-- Name: clinic_participants_encounter_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_participants_encounter_lookup ON public.clinic_encounter_participants USING btree (practice_id, encounter_id);


--
-- Name: clinic_participants_one_current_queue_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_participants_one_current_queue_provider ON public.clinic_encounter_participants USING btree (practice_id, encounter_id) WHERE (((participation_role)::text = 'queue_provider'::text) AND (effective_until IS NULL));


--
-- Name: clinic_patient_address_versions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_address_versions_practice_id ON public.clinic_patient_address_versions USING btree (practice_id, id);


--
-- Name: clinic_patient_addresses_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_addresses_owner_id ON public.clinic_patient_address_versions USING btree (practice_id, patient_id, id);


--
-- Name: clinic_patient_addresses_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_addresses_version ON public.clinic_patient_address_versions USING btree (practice_id, patient_id, version);


--
-- Name: clinic_patient_care_needs_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_care_needs_practice_id ON public.clinic_patient_care_needs USING btree (practice_id, id);


--
-- Name: clinic_patient_care_needs_recorded_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_care_needs_recorded_by_membership_id_fk ON public.clinic_patient_care_needs USING btree (practice_id, recorded_by_membership_id);


--
-- Name: clinic_patient_care_needs_reviewed_by_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_care_needs_reviewed_by_membership_id_fk ON public.clinic_patient_care_needs USING btree (practice_id, reviewed_by_membership_id);


--
-- Name: clinic_patient_communication_preferences_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_communication_preferences_identity ON public.clinic_patient_communication_preferences USING btree (practice_id, patient_id);


--
-- Name: clinic_patient_communication_preferences_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_communication_preferences_patient_time ON public.clinic_patient_communication_preferences USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_patient_communication_preferences_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_communication_preferences_practice_id ON public.clinic_patient_communication_preferences USING btree (practice_id, id);


--
-- Name: clinic_patient_contacts_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_contacts_patient_time ON public.clinic_patient_contacts USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_patient_contacts_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_contacts_practice_id ON public.clinic_patient_contacts USING btree (practice_id, id);


--
-- Name: clinic_patient_demographics_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_demographics_identity ON public.clinic_patient_demographics USING btree (practice_id, patient_id);


--
-- Name: clinic_patient_demographics_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_demographics_patient_time ON public.clinic_patient_demographics USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_patient_demographics_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_demographics_practice_id ON public.clinic_patient_demographics USING btree (practice_id, id);


--
-- Name: clinic_patient_emergency_contacts_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_emergency_contacts_patient_time ON public.clinic_patient_emergency_contacts USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_patient_emergency_contacts_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_emergency_contacts_practice_id ON public.clinic_patient_emergency_contacts USING btree (practice_id, id);


--
-- Name: clinic_patient_history_reviews_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_history_reviews_practice_id ON public.clinic_patient_history_reviews USING btree (practice_id, id);


--
-- Name: clinic_patient_history_reviews_reviewer_membership_id_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_history_reviews_reviewer_membership_id_fk ON public.clinic_patient_history_reviews USING btree (practice_id, reviewer_membership_id);


--
-- Name: clinic_patient_memberships_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_memberships_identity ON public.clinic_patient_memberships USING btree (practice_id, patient_id, version);


--
-- Name: clinic_patient_memberships_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_memberships_patient_id ON public.clinic_patient_memberships USING btree (practice_id, patient_id, id);


--
-- Name: clinic_patient_memberships_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_memberships_practice_id ON public.clinic_patient_memberships USING btree (practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests_appointment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_portal_appointment_requests_appointment ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, appointment_id) WHERE (appointment_id IS NOT NULL);


--
-- Name: clinic_patient_portal_appointment_requests_pending_change; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_appointment_requests_pending_change ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, source_appointment_id) WHERE (((status)::text = 'pending'::text) AND (source_appointment_id IS NOT NULL));


--
-- Name: clinic_patient_portal_appointment_requests_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_appointment_requests_practice_id ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_appointment_requests_request_key ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, request_key);


--
-- Name: clinic_patient_portal_appointment_requests_source_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_portal_appointment_requests_source_site ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, source_site_id);


--
-- Name: clinic_patient_portal_appointment_requests_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_portal_appointment_requests_worklist ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, patient_id, status, starts_at);


--
-- Name: clinic_patient_portal_identities_invitation_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_identities_invitation_digest ON public.clinic_patient_portal_identities USING btree (invitation_digest) WHERE (invitation_digest IS NOT NULL);


--
-- Name: clinic_patient_portal_identities_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_identities_patient ON public.clinic_patient_portal_identities USING btree (practice_id, patient_id);


--
-- Name: clinic_patient_portal_identities_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_identities_practice_id ON public.clinic_patient_portal_identities USING btree (practice_id, id);


--
-- Name: clinic_patient_portal_identities_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_identities_user ON public.clinic_patient_portal_identities USING btree (user_id);


--
-- Name: clinic_patient_portal_requests_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_requests_practice_id ON public.clinic_patient_portal_requests USING btree (practice_id, id);


--
-- Name: clinic_patient_portal_requests_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_requests_request_key ON public.clinic_patient_portal_requests USING btree (practice_id, request_key);


--
-- Name: clinic_patient_portal_requests_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_portal_requests_worklist ON public.clinic_patient_portal_requests USING btree (practice_id, patient_id, status, requested_at);


--
-- Name: clinic_patient_reminder_actions_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_reminder_actions_request ON public.clinic_patient_reminder_actions USING btree (practice_id, request_key);


--
-- Name: clinic_patient_reminder_attempts_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_reminder_attempts_number ON public.clinic_patient_reminder_delivery_attempts USING btree (practice_id, reminder_id, attempt_number);


--
-- Name: clinic_patient_reminder_outbox_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_reminder_outbox_identity ON public.clinic_patient_reminder_outbox USING btree (practice_id, reminder_id);


--
-- Name: clinic_patient_reminder_outbox_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_reminder_outbox_queue ON public.clinic_patient_reminder_outbox USING btree (dispatch_state, available_at);


--
-- Name: clinic_patient_reminders_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_reminders_dedupe ON public.clinic_patient_reminders USING btree (practice_id, dedupe_key);


--
-- Name: clinic_patient_reminders_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_reminders_practice_id ON public.clinic_patient_reminders USING btree (practice_id, id);


--
-- Name: clinic_patient_reminders_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_reminders_worklist ON public.clinic_patient_reminders USING btree (practice_id, status, scheduled_at);


--
-- Name: clinic_patient_social_histories_patient_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_social_histories_patient_time ON public.clinic_patient_social_histories USING btree (practice_id, patient_id, created_at);


--
-- Name: clinic_patient_social_histories_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_social_histories_practice_id ON public.clinic_patient_social_histories USING btree (practice_id, id);


--
-- Name: clinic_payment_allocations_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_allocations_practice_id ON public.clinic_payment_allocations USING btree (practice_id, id);


--
-- Name: clinic_payment_collection_intents_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_collection_intents_practice_id ON public.clinic_payment_collection_intents USING btree (practice_id, id);


--
-- Name: clinic_payment_collection_intents_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_collection_intents_reference ON public.clinic_payment_collection_intents USING btree (practice_id, reference);


--
-- Name: clinic_payment_collection_intents_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_collection_intents_request_key ON public.clinic_payment_collection_intents USING btree (practice_id, request_key);


--
-- Name: clinic_payment_events_external_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_events_external_ref ON public.clinic_payment_events USING btree (practice_id, external_event_reference);


--
-- Name: clinic_payment_events_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_events_patient_id ON public.clinic_payment_events USING btree (practice_id, patient_id, id);


--
-- Name: clinic_payment_events_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_events_practice_id ON public.clinic_payment_events USING btree (practice_id, id);


--
-- Name: clinic_payment_processor_events_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_processor_events_identity ON public.clinic_payment_processor_events USING btree (practice_id, processor, processor_event_reference);


--
-- Name: clinic_payment_processor_events_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_payment_processor_events_practice_id ON public.clinic_payment_processor_events USING btree (practice_id, id);


--
-- Name: clinic_precautions_encounter_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_precautions_encounter_status ON public.clinic_encounter_precautions USING btree (practice_id, encounter_id, status, recorded_at);


--
-- Name: clinic_precautions_patient_encounter_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_precautions_patient_encounter_fk ON public.clinic_encounter_precautions USING btree (practice_id, patient_id, encounter_id);


--
-- Name: clinic_previsit_notes_appointment_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_previsit_notes_appointment_version ON public.clinic_previsit_notes USING btree (practice_id, patient_id, appointment_id, version_number);


--
-- Name: clinic_previsit_notes_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_previsit_notes_practice_id ON public.clinic_previsit_notes USING btree (practice_id, id);


--
-- Name: clinic_previsit_notes_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_previsit_notes_request_key ON public.clinic_previsit_notes USING btree (practice_id, submitted_by_user_id, request_key);


--
-- Name: clinic_profiles_membership; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_profiles_membership ON public.clinic_clinician_profiles USING btree (practice_id, membership_id);


--
-- Name: clinic_refund_events_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_refund_events_practice_id ON public.clinic_refund_events USING btree (practice_id, id);


--
-- Name: clinic_role_grant_events_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_role_grant_events_practice_id ON public.clinic_role_grant_events USING btree (practice_id, id);


--
-- Name: clinic_role_grant_events_revision; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_role_grant_events_revision ON public.clinic_role_grant_events USING btree (practice_id, grant_id, grant_revision);


--
-- Name: clinic_role_grants_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_role_grants_practice_id ON public.clinic_role_grants USING btree (practice_id, id);


--
-- Name: clinic_role_grants_practice_scope_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_role_grants_practice_scope_identity ON public.clinic_role_grants USING btree (practice_id, membership_id, role_version_id, scope_kind) WHERE (site_id IS NULL);


--
-- Name: clinic_role_grants_site_scope_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_role_grants_site_scope_identity ON public.clinic_role_grants USING btree (practice_id, membership_id, role_version_id, scope_kind, site_id) WHERE (site_id IS NOT NULL);


--
-- Name: clinic_rooms_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_rooms_practice_id ON public.clinic_rooms USING btree (practice_id, id);


--
-- Name: clinic_rooms_practice_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_rooms_practice_site_id ON public.clinic_rooms USING btree (practice_id, site_id, id);


--
-- Name: clinic_rooms_site_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_rooms_site_code ON public.clinic_rooms USING btree (practice_id, site_id, code);


--
-- Name: clinic_scribe_drafts_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_scribe_drafts_practice_id ON public.clinic_scribe_drafts USING btree (practice_id, id);


--
-- Name: clinic_scribe_drafts_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_scribe_drafts_scope ON public.clinic_scribe_drafts USING btree (practice_id, encounter_id, id);


--
-- Name: clinic_scribe_encounters_clinical_encounter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_scribe_encounters_clinical_encounter ON public.clinic_scribe_encounters USING btree (practice_id, clinical_encounter_id);


--
-- Name: clinic_scribe_encounters_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_scribe_encounters_practice_id ON public.clinic_scribe_encounters USING btree (practice_id, id);


--
-- Name: clinic_scribe_encounters_practice_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_scribe_encounters_practice_patient_id ON public.clinic_scribe_encounters USING btree (practice_id, patient_id, id);


--
-- Name: clinic_scribe_exports_encounter_note; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_scribe_exports_encounter_note ON public.clinic_scribe_exports USING btree (practice_id, encounter_note_id);


--
-- Name: clinic_scribe_lab_selections_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_scribe_lab_selections_identity ON public.clinic_scribe_lab_selections USING btree (practice_id, encounter_id, lab_report_version_id);


--
-- Name: clinic_scribe_lab_selections_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_scribe_lab_selections_practice_id ON public.clinic_scribe_lab_selections USING btree (practice_id, id);


--
-- Name: clinic_scribe_sources_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_scribe_sources_practice_id ON public.clinic_scribe_sources USING btree (practice_id, id);


--
-- Name: clinic_scribe_sources_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_scribe_sources_scope ON public.clinic_scribe_sources USING btree (practice_id, encounter_id, id);


--
-- Name: clinic_site_hour_exceptions_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_site_hour_exceptions_identity ON public.clinic_site_hour_exceptions USING btree (practice_id, site_id, date);


--
-- Name: clinic_site_hours_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_site_hours_identity ON public.clinic_site_operating_hours USING btree (practice_id, site_id, day_of_week);


--
-- Name: clinic_sites_practice_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_sites_practice_code ON public.clinic_sites USING btree (practice_id, code);


--
-- Name: clinic_sites_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_sites_practice_id ON public.clinic_sites USING btree (practice_id, id);


--
-- Name: clinic_staff_address_versions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_address_versions_practice_id ON public.clinic_staff_address_versions USING btree (practice_id, id);


--
-- Name: clinic_staff_addresses_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_addresses_owner_id ON public.clinic_staff_address_versions USING btree (practice_id, staff_member_id, id);


--
-- Name: clinic_staff_addresses_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_addresses_version ON public.clinic_staff_address_versions USING btree (practice_id, staff_member_id, version);


--
-- Name: clinic_staff_conversation_members_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_conversation_members_identity ON public.clinic_staff_conversation_members USING btree (practice_id, conversation_id, membership_id);


--
-- Name: clinic_staff_conversation_members_visible; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_staff_conversation_members_visible ON public.clinic_staff_conversation_members USING btree (practice_id, membership_id, membership_state);


--
-- Name: clinic_staff_conversations_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_conversations_practice_id ON public.clinic_staff_conversations USING btree (practice_id, id);


--
-- Name: clinic_staff_conversations_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_staff_conversations_recent ON public.clinic_staff_conversations USING btree (practice_id, site_id, last_message_at);


--
-- Name: clinic_staff_members_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_members_practice_id ON public.clinic_staff_members USING btree (practice_id, id);


--
-- Name: clinic_staff_message_attachments_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_staff_message_attachments_history ON public.clinic_staff_message_attachments USING btree (practice_id, message_id, id);


--
-- Name: clinic_staff_message_escalations_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_message_escalations_dedupe ON public.clinic_staff_message_escalations USING btree (practice_id, dedupe_key);


--
-- Name: clinic_staff_message_outbox_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_message_outbox_identity ON public.clinic_staff_message_outbox USING btree (practice_id, message_id, event_type);


--
-- Name: clinic_staff_message_receipts_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_message_receipts_identity ON public.clinic_staff_message_receipts USING btree (practice_id, message_id, recipient_membership_id);


--
-- Name: clinic_staff_message_requests_message; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_message_requests_message ON public.clinic_staff_message_requests USING btree (practice_id, message_id);


--
-- Name: clinic_staff_message_requests_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_message_requests_practice_id ON public.clinic_staff_message_requests USING btree (practice_id, id);


--
-- Name: clinic_staff_messages_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_staff_messages_history ON public.clinic_staff_messages USING btree (practice_id, conversation_id, created_at, id);


--
-- Name: clinic_staff_messages_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_messages_idempotency ON public.clinic_staff_messages USING btree (practice_id, sender_membership_id, request_key);


--
-- Name: clinic_staff_messages_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_messages_practice_id ON public.clinic_staff_messages USING btree (practice_id, id);


--
-- Name: clinic_staff_notification_preferences_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_notification_preferences_identity ON public.clinic_staff_notification_preferences USING btree (practice_id, membership_id);


--
-- Name: clinic_staff_notifications_inbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_staff_notifications_inbox ON public.clinic_staff_notifications USING btree (practice_id, recipient_membership_id, read_at, created_at);


--
-- Name: clinic_supplier_address_versions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_supplier_address_versions_practice_id ON public.clinic_supplier_address_versions USING btree (practice_id, id);


--
-- Name: clinic_supplier_addresses_owner_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_supplier_addresses_owner_id ON public.clinic_supplier_address_versions USING btree (practice_id, supplier_id, id);


--
-- Name: clinic_supplier_addresses_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_supplier_addresses_version ON public.clinic_supplier_address_versions USING btree (practice_id, supplier_id, version);


--
-- Name: clinic_visit_types_practice_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_visit_types_practice_code ON public.clinic_visit_types USING btree (practice_id, code);


--
-- Name: clinic_visit_types_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_visit_types_practice_id ON public.clinic_visit_types USING btree (practice_id, id);


--
-- Name: clinic_working_drafts_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_working_drafts_identity ON public.clinic_working_drafts USING btree (practice_id, actor_membership_id, context_key);


--
-- Name: idx_encounter_follow_ups_canonical; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_encounter_follow_ups_canonical ON public.clinic_encounter_follow_ups USING btree (practice_id, encounter_id);


--
-- Name: idx_encounter_follow_ups_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encounter_follow_ups_worklist ON public.clinic_encounter_follow_ups USING btree (practice_id, state, due_at, id);


--
-- Name: idx_on_account_id_session_id_15ca542b56; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_account_id_session_id_15ca542b56 ON public.clinic_invoice_stripe_checkouts USING btree (account_id, session_id);


--
-- Name: idx_on_account_id_subscription_id_ff19119ce5; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_account_id_subscription_id_ff19119ce5 ON public.clinic_stripe_checkouts USING btree (account_id, subscription_id);


--
-- Name: idx_on_actor_session_reference_occurred_at_fc6d32a259; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_actor_session_reference_occurred_at_fc6d32a259 ON public.platform_audit_events USING btree (actor_session_reference, occurred_at);


--
-- Name: idx_on_practice_id_actor_session_reference_occurred_814d8dd62d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_actor_session_reference_occurred_814d8dd62d ON public.clinic_audit_events USING btree (practice_id, actor_session_reference, occurred_at);


--
-- Name: idx_on_practice_id_appointment_id_f9e07d7cc7; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_appointment_id_f9e07d7cc7 ON public.clinic_telehealth_visits USING btree (practice_id, appointment_id);


--
-- Name: idx_on_practice_id_booked_clinician_id_starts_at_9122dfc127; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_booked_clinician_id_starts_at_9122dfc127 ON public.clinic_appointments USING btree (practice_id, booked_clinician_id, starts_at);


--
-- Name: idx_on_practice_id_checkout_group_id_4eb1f0798f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_checkout_group_id_4eb1f0798f ON public.clinic_inventory_purchase_orders USING btree (practice_id, checkout_group_id);


--
-- Name: idx_on_practice_id_clinician_profile_id_credential__de8ec8ea47; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_clinician_profile_id_credential__de8ec8ea47 ON public.clinic_clinician_credentials USING btree (practice_id, clinician_profile_id, credential_type);


--
-- Name: idx_on_practice_id_device_identifier_90837c49a5; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_device_identifier_90837c49a5 ON public.clinic_pharmacy_products USING btree (practice_id, device_identifier);


--
-- Name: idx_on_practice_id_employment_id_status_41c67b575c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_employment_id_status_41c67b575c ON public.clinic_workforce_adjustment_requests USING btree (practice_id, employment_id, status);


--
-- Name: idx_on_practice_id_encounter_id_created_at_880ba6ae84; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_encounter_id_created_at_880ba6ae84 ON public.clinic_scribe_events USING btree (practice_id, encounter_id, created_at);


--
-- Name: idx_on_practice_id_encounter_id_effective_from_f3808ef949; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_encounter_id_effective_from_f3808ef949 ON public.clinic_encounter_participants USING btree (practice_id, encounter_id, effective_from);


--
-- Name: idx_on_practice_id_encounter_id_status_b036767cec; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_encounter_id_status_b036767cec ON public.clinic_scribe_sources USING btree (practice_id, encounter_id, status);


--
-- Name: idx_on_practice_id_encounter_id_status_f9bef95069; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_encounter_id_status_f9bef95069 ON public.clinic_scribe_drafts USING btree (practice_id, encounter_id, status);


--
-- Name: idx_on_practice_id_id_0500e5e548; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_0500e5e548 ON public.clinic_workforce_employee_invitations USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_0c7a88777c; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_0c7a88777c ON public.clinic_inventory_recall_dispositions USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_2f9691e89a; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_2f9691e89a ON public.clinic_workforce_shift_swap_requests USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_40231966ed; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_40231966ed ON public.clinic_inventory_purchase_order_events USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_43fe56c3ac; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_43fe56c3ac ON public.clinic_workforce_availability_versions USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_7365d3f122; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_7365d3f122 ON public.clinic_inventory_purchase_order_lines USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_8c7258c8f9; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_8c7258c8f9 ON public.clinic_inventory_purchase_cart_items USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_949e35bd12; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_949e35bd12 ON public.clinic_workforce_schedule_publications USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_e5fda4f1b6; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_e5fda4f1b6 ON public.clinic_workforce_schedule_templates USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_ee4e957d65; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_ee4e957d65 ON public.clinic_workforce_adjustment_requests USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_fbac602383; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_fbac602383 ON public.clinic_inventory_receiving_sessions USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_idempotency_key_2b63f09cc6; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_idempotency_key_2b63f09cc6 ON public.clinic_workforce_time_off_requests USING btree (practice_id, idempotency_key);


--
-- Name: idx_on_practice_id_idempotency_key_4456d92c89; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_idempotency_key_4456d92c89 ON public.clinic_workforce_availability_versions USING btree (practice_id, idempotency_key);


--
-- Name: idx_on_practice_id_idempotency_key_60bb7b62db; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_idempotency_key_60bb7b62db ON public.clinic_workforce_shift_swap_requests USING btree (practice_id, idempotency_key);


--
-- Name: idx_on_practice_id_invoice_id_201b44341d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_invoice_id_201b44341d ON public.clinic_invoice_stripe_checkouts USING btree (practice_id, invoice_id);


--
-- Name: idx_on_practice_id_invoice_id_7f5cc16f0c; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_invoice_id_7f5cc16f0c ON public.clinic_payment_collection_intents USING btree (practice_id, invoice_id);


--
-- Name: idx_on_practice_id_invoice_id_id_e53e1ae573; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_invoice_id_id_e53e1ae573 ON public.clinic_invoice_lines USING btree (practice_id, invoice_id, id);


--
-- Name: idx_on_practice_id_kiosk_session_id_expires_at_c467e83429; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_kiosk_session_id_expires_at_c467e83429 ON public.clinic_workforce_punch_challenges USING btree (practice_id, kiosk_session_id, expires_at);


--
-- Name: idx_on_practice_id_membership_id_effective_from_328f63f9f7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_membership_id_effective_from_328f63f9f7 ON public.clinic_role_grants USING btree (practice_id, membership_id, effective_from);


--
-- Name: idx_on_practice_id_membership_id_effective_from_709a049304; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_membership_id_effective_from_709a049304 ON public.clinic_encounter_participants USING btree (practice_id, membership_id, effective_from);


--
-- Name: idx_on_practice_id_patient_id_created_at_35062a5d24; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_patient_id_created_at_35062a5d24 ON public.clinic_documents USING btree (practice_id, patient_id, created_at);


--
-- Name: idx_on_practice_id_patient_id_created_at_5b2cecaa6b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_patient_id_created_at_5b2cecaa6b ON public.clinic_invoices USING btree (practice_id, patient_id, created_at);


--
-- Name: idx_on_practice_id_patient_id_observed_at_fd04db6539; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_patient_id_observed_at_fd04db6539 ON public.clinic_observations USING btree (practice_id, patient_id, observed_at);


--
-- Name: idx_on_practice_id_patient_id_started_at_0c005b0dcf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_patient_id_started_at_0c005b0dcf ON public.clinic_encounters USING btree (practice_id, patient_id, started_at);


--
-- Name: idx_on_practice_id_patient_id_starts_at_edd4045557; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_patient_id_starts_at_edd4045557 ON public.clinic_appointments USING btree (practice_id, patient_id, starts_at);


--
-- Name: idx_on_practice_id_payment_collection_intent_id_187a194e26; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_payment_collection_intent_id_187a194e26 ON public.clinic_payment_processor_events USING btree (practice_id, payment_collection_intent_id);


--
-- Name: idx_on_practice_id_payment_event_id_59b16d70c4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_payment_event_id_59b16d70c4 ON public.clinic_payment_allocations USING btree (practice_id, payment_event_id);


--
-- Name: idx_on_practice_id_preferred_supplier_id_3c4636d552; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_preferred_supplier_id_3c4636d552 ON public.clinic_pharmacy_products USING btree (practice_id, preferred_supplier_id);


--
-- Name: idx_on_practice_id_product_id_d3fe7f24e8; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_product_id_d3fe7f24e8 ON public.clinic_inventory_supplier_products USING btree (practice_id, product_id);


--
-- Name: idx_on_practice_id_public_id_5e2cd22580; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_public_id_5e2cd22580 ON public.clinic_workforce_availability_versions USING btree (practice_id, public_id);


--
-- Name: idx_on_practice_id_public_id_a25f30437e; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_public_id_a25f30437e ON public.clinic_workforce_time_off_requests USING btree (practice_id, public_id);


--
-- Name: idx_on_practice_id_public_id_ea66fc3198; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_public_id_ea66fc3198 ON public.clinic_workforce_shift_swap_requests USING btree (practice_id, public_id);


--
-- Name: idx_on_practice_id_purchase_order_id_7e353f8cf7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_purchase_order_id_7e353f8cf7 ON public.clinic_inventory_receipts USING btree (practice_id, purchase_order_id);


--
-- Name: idx_on_practice_id_purchase_order_id_id_162a9060ea; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_purchase_order_id_id_162a9060ea ON public.clinic_inventory_vendor_returns USING btree (practice_id, purchase_order_id, id);


--
-- Name: idx_on_practice_id_purchase_order_id_id_b5a64dc810; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_purchase_order_id_id_b5a64dc810 ON public.clinic_inventory_receiving_sessions USING btree (practice_id, purchase_order_id, id);


--
-- Name: idx_on_practice_id_purchase_order_id_id_d94f406245; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_purchase_order_id_id_d94f406245 ON public.clinic_inventory_supplier_invoices USING btree (practice_id, purchase_order_id, id);


--
-- Name: idx_on_practice_id_purchase_order_id_id_f086ea60ce; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_purchase_order_id_id_f086ea60ce ON public.clinic_inventory_supplier_credits USING btree (practice_id, purchase_order_id, id);


--
-- Name: idx_on_practice_id_request_key_1ddd3142c3; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_request_key_1ddd3142c3 ON public.clinic_inventory_receiving_sessions USING btree (practice_id, request_key);


--
-- Name: idx_on_practice_id_request_key_6747e9efbb; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_request_key_6747e9efbb ON public.clinic_workforce_adjustment_requests USING btree (practice_id, request_key);


--
-- Name: idx_on_practice_id_request_key_68aab2701f; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_request_key_68aab2701f ON public.clinic_inventory_vendor_returns USING btree (practice_id, request_key);


--
-- Name: idx_on_practice_id_request_key_71dc68b269; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_request_key_71dc68b269 ON public.clinic_inventory_supplier_invoices USING btree (practice_id, request_key);


--
-- Name: idx_on_practice_id_request_key_a63afaee18; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_request_key_a63afaee18 ON public.clinic_pharmacy_batch_events USING btree (practice_id, request_key);


--
-- Name: idx_on_practice_id_request_key_e81f2a24be; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_request_key_e81f2a24be ON public.clinic_inventory_supplier_credits USING btree (practice_id, request_key);


--
-- Name: idx_on_practice_id_room_id_starts_at_a9d2f79b4f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_room_id_starts_at_a9d2f79b4f ON public.clinic_appointments USING btree (practice_id, room_id, starts_at);


--
-- Name: idx_on_practice_id_site_id_effective_from_9a85bf6413; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_site_id_effective_from_9a85bf6413 ON public.clinic_clinician_assignments USING btree (practice_id, site_id, effective_from);


--
-- Name: idx_on_practice_id_site_id_status_b22685788d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_site_id_status_b22685788d ON public.clinic_workforce_kiosk_sessions USING btree (practice_id, site_id, status);


--
-- Name: idx_on_practice_id_status_appointment_id_bc07440aaf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_status_appointment_id_bc07440aaf ON public.clinic_telehealth_visits USING btree (practice_id, status, appointment_id);


--
-- Name: idx_on_practice_id_visit_id_sequence_f654bdfb4d; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_visit_id_sequence_f654bdfb4d ON public.clinic_telehealth_checkins USING btree (practice_id, visit_id, sequence);


--
-- Name: idx_one_active_telehealth_recording; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_active_telehealth_recording ON public.clinic_scribe_recordings USING btree (practice_id, telehealth_visit_id) WHERE ((telehealth_visit_id IS NOT NULL) AND ((status)::text = 'recording'::text));


--
-- Name: idx_scribe_exports_tenant_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_scribe_exports_tenant_identity ON public.clinic_scribe_exports USING btree (practice_id, id);


--
-- Name: idx_scribe_recordings_telehealth_provenance; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_scribe_recordings_telehealth_provenance ON public.clinic_scribe_recordings USING btree (practice_id, telehealth_visit_id, capture_epoch, recording_segment_index, source_order) WHERE (telehealth_visit_id IS NOT NULL);


--
-- Name: idx_telehealth_consent_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_consent_sequence ON public.clinic_telehealth_consents USING btree (practice_id, visit_id, participant_id, purpose, sequence);


--
-- Name: idx_telehealth_join_grant_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telehealth_join_grant_expiry ON public.clinic_telehealth_join_grants USING btree (practice_id, visit_id, participant_id, expires_at);


--
-- Name: idx_telehealth_join_grant_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_join_grant_request ON public.clinic_telehealth_join_grants USING btree (practice_id, participant_id, access_generation, request_digest);


--
-- Name: idx_telehealth_one_live_room; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_one_live_room ON public.clinic_telehealth_room_attempts USING btree (practice_id, visit_id) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'provisioning'::character varying, 'ready'::character varying, 'active'::character varying, 'ending'::character varying, 'unknown'::character varying])::text[]));


--
-- Name: idx_telehealth_one_patient_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_one_patient_participant ON public.clinic_telehealth_participants USING btree (practice_id, visit_id) WHERE ((role)::text = 'patient'::text);


--
-- Name: idx_telehealth_one_setting_per_practice; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_one_setting_per_practice ON public.clinic_telehealth_settings USING btree (practice_id);


--
-- Name: idx_telehealth_participant_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_participant_identity ON public.clinic_telehealth_participants USING btree (practice_id, visit_id, portal_identity_id) WHERE (portal_identity_id IS NOT NULL);


--
-- Name: idx_telehealth_participant_membership; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_participant_membership ON public.clinic_telehealth_participants USING btree (practice_id, visit_id, membership_id) WHERE (membership_id IS NOT NULL);


--
-- Name: idx_telehealth_patient_receipt; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_patient_receipt ON public.clinic_telehealth_patient_receipts USING btree (practice_id, portal_identity_id, request_key);


--
-- Name: idx_telehealth_policy_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_policy_version ON public.clinic_telehealth_policy_versions USING btree (practice_id, settings_id, version);


--
-- Name: idx_telehealth_provider_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_provider_event ON public.clinic_telehealth_provider_events USING btree (provider_code, provider_account_ref, provider_event_id);


--
-- Name: idx_telehealth_provider_room; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_provider_room ON public.clinic_telehealth_room_attempts USING btree (provider_code, provider_account_ref, provider_room_name);


--
-- Name: idx_telehealth_provider_room_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_provider_room_ref ON public.clinic_telehealth_room_attempts USING btree (provider_code, provider_account_ref, provider_room_ref) WHERE (provider_room_ref IS NOT NULL);


--
-- Name: idx_telehealth_room_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_room_attempt ON public.clinic_telehealth_room_attempts USING btree (practice_id, visit_id, attempt_no);


--
-- Name: idx_telehealth_rule_practice; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_rule_practice ON public.clinic_telehealth_visit_type_rules USING btree (practice_id, visit_type_id) WHERE (site_id IS NULL);


--
-- Name: idx_telehealth_rule_site; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_rule_site ON public.clinic_telehealth_visit_type_rules USING btree (practice_id, visit_type_id, site_id) WHERE (site_id IS NOT NULL);


--
-- Name: idx_telehealth_scribe_source_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_scribe_source_order ON public.clinic_scribe_sources USING btree (practice_id, telehealth_visit_id, capture_epoch, recording_segment_index, source_order) WHERE (telehealth_visit_id IS NOT NULL);


--
-- Name: idx_telehealth_visit_scribe_encounter; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_visit_scribe_encounter ON public.clinic_telehealth_visits USING btree (practice_id, scribe_encounter_id) WHERE (scribe_encounter_id IS NOT NULL);


--
-- Name: idx_telehealth_wrap_ups_tenant_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_wrap_ups_tenant_identity ON public.clinic_telehealth_wrap_ups USING btree (practice_id, id);


--
-- Name: idx_telehealth_wrap_ups_visit; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_telehealth_wrap_ups_visit ON public.clinic_telehealth_wrap_ups USING btree (practice_id, visit_id);


--
-- Name: idx_workforce_one_active_badge; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_workforce_one_active_badge ON public.clinic_workforce_badge_credentials USING btree (practice_id, employment_id) WHERE ((status)::text = 'issued'::text);


--
-- Name: idx_workforce_punches_employee_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workforce_punches_employee_time ON public.clinic_workforce_punches USING btree (practice_id, employment_id, occurred_at_utc, id);


--
-- Name: idx_workforce_segments_timecard; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workforce_segments_timecard ON public.clinic_workforce_time_segments USING btree (practice_id, timecard_version_id, started_at_utc);


--
-- Name: idx_workforce_timecard_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_workforce_timecard_version ON public.clinic_workforce_timecard_versions USING btree (practice_id, employment_id, period_start, version_number);


--
-- Name: idx_workforce_timecards_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workforce_timecards_status ON public.clinic_workforce_timecard_versions USING btree (practice_id, employment_id, period_start, status);


--
-- Name: index_clinic_billing_receipts_on_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_billing_receipts_on_invoice_id ON public.clinic_billing_receipts USING btree (invoice_id);


--
-- Name: index_clinic_billing_receipts_on_issued_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_billing_receipts_on_issued_by_id ON public.clinic_billing_receipts USING btree (issued_by_id);


--
-- Name: index_clinic_billing_receipts_on_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_billing_receipts_on_patient_id ON public.clinic_billing_receipts USING btree (patient_id);


--
-- Name: index_clinic_billing_receipts_on_payment_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_billing_receipts_on_payment_event_id ON public.clinic_billing_receipts USING btree (payment_event_id);


--
-- Name: index_clinic_billing_receipts_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_billing_receipts_on_practice_id ON public.clinic_billing_receipts USING btree (practice_id);


--
-- Name: index_clinic_cash_drawer_sessions_on_closed_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_drawer_sessions_on_closed_by_id ON public.clinic_cash_drawer_sessions USING btree (closed_by_id);


--
-- Name: index_clinic_cash_drawer_sessions_on_opened_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_drawer_sessions_on_opened_by_id ON public.clinic_cash_drawer_sessions USING btree (opened_by_id);


--
-- Name: index_clinic_cash_drawer_sessions_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_drawer_sessions_on_practice_id ON public.clinic_cash_drawer_sessions USING btree (practice_id);


--
-- Name: index_clinic_cash_drawer_sessions_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_cash_drawer_sessions_on_practice_id_and_id ON public.clinic_cash_drawer_sessions USING btree (practice_id, id);


--
-- Name: index_clinic_cash_drawer_sessions_on_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_drawer_sessions_on_site_id ON public.clinic_cash_drawer_sessions USING btree (site_id);


--
-- Name: index_clinic_cash_tenders_on_cash_drawer_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_tenders_on_cash_drawer_session_id ON public.clinic_cash_tenders USING btree (cash_drawer_session_id);


--
-- Name: index_clinic_cash_tenders_on_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_tenders_on_patient_id ON public.clinic_cash_tenders USING btree (patient_id);


--
-- Name: index_clinic_cash_tenders_on_payment_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_tenders_on_payment_event_id ON public.clinic_cash_tenders USING btree (payment_event_id);


--
-- Name: index_clinic_cash_tenders_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_tenders_on_practice_id ON public.clinic_cash_tenders USING btree (practice_id);


--
-- Name: index_clinic_cash_tenders_on_practice_id_and_payment_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_cash_tenders_on_practice_id_and_payment_event_id ON public.clinic_cash_tenders USING btree (practice_id, payment_event_id);


--
-- Name: index_clinic_cash_tenders_on_recorded_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_cash_tenders_on_recorded_by_id ON public.clinic_cash_tenders USING btree (recorded_by_id);


--
-- Name: index_clinic_communication_endpoints_on_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_communication_endpoints_on_patient_id ON public.clinic_communication_endpoints USING btree (patient_id);


--
-- Name: index_clinic_communication_endpoints_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_communication_endpoints_on_practice_id ON public.clinic_communication_endpoints USING btree (practice_id);


--
-- Name: index_clinic_communication_preferences_on_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_communication_preferences_on_patient_id ON public.clinic_communication_preferences USING btree (patient_id);


--
-- Name: index_clinic_communication_preferences_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_communication_preferences_on_practice_id ON public.clinic_communication_preferences USING btree (practice_id);


--
-- Name: index_clinic_encounter_follow_ups_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_encounter_follow_ups_on_practice_id ON public.clinic_encounter_follow_ups USING btree (practice_id);


--
-- Name: index_clinic_insurance_claims_on_practice_id_and_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_insurance_claims_on_practice_id_and_invoice_id ON public.clinic_insurance_claims USING btree (practice_id, invoice_id);


--
-- Name: index_clinic_inventory_catalog_events_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_catalog_events_on_practice_id_and_id ON public.clinic_inventory_catalog_events USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_control_reviews_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_control_reviews_on_practice_id_and_id ON public.clinic_inventory_control_reviews USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_count_approvals_on_count_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_count_approvals_on_count_id ON public.clinic_inventory_count_approvals USING btree (count_id);


--
-- Name: index_clinic_inventory_count_approvals_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_count_approvals_on_practice_id_and_id ON public.clinic_inventory_count_approvals USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_counts_on_batch_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_counts_on_batch_id_and_id ON public.clinic_inventory_counts USING btree (batch_id, id);


--
-- Name: index_clinic_inventory_counts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_counts_on_practice_id_and_id ON public.clinic_inventory_counts USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_entries_on_batch_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_entries_on_batch_id_and_id ON public.clinic_inventory_entries USING btree (batch_id, id);


--
-- Name: index_clinic_inventory_entries_on_count_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_entries_on_count_id ON public.clinic_inventory_entries USING btree (count_id);


--
-- Name: index_clinic_inventory_entries_on_item_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_entries_on_item_id_and_id ON public.clinic_inventory_entries USING btree (item_id, id);


--
-- Name: index_clinic_inventory_entries_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_entries_on_practice_id_and_id ON public.clinic_inventory_entries USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_entries_on_recall_disposition_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_entries_on_recall_disposition_id ON public.clinic_inventory_entries USING btree (recall_disposition_id);


--
-- Name: index_clinic_inventory_entries_on_receipt_line_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_entries_on_receipt_line_id ON public.clinic_inventory_entries USING btree (receipt_line_id);


--
-- Name: index_clinic_inventory_entries_on_transfer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_entries_on_transfer_id ON public.clinic_inventory_entries USING btree (transfer_id);


--
-- Name: index_clinic_inventory_hold_releases_on_hold_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_hold_releases_on_hold_id ON public.clinic_inventory_hold_releases USING btree (hold_id);


--
-- Name: index_clinic_inventory_hold_releases_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_hold_releases_on_practice_id_and_id ON public.clinic_inventory_hold_releases USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_holds_on_batch_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_holds_on_batch_id_and_id ON public.clinic_inventory_holds USING btree (batch_id, id);


--
-- Name: index_clinic_inventory_holds_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_holds_on_practice_id_and_id ON public.clinic_inventory_holds USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_holds_on_recall_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_holds_on_recall_id ON public.clinic_inventory_holds USING btree (recall_id);


--
-- Name: index_clinic_inventory_holds_on_transfer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_holds_on_transfer_id ON public.clinic_inventory_holds USING btree (transfer_id);


--
-- Name: index_clinic_inventory_locations_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_locations_on_practice_id_and_id ON public.clinic_inventory_locations USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_lots_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_lots_on_practice_id_and_id ON public.clinic_inventory_lots USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_profiles_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_profiles_on_practice_id_and_id ON public.clinic_inventory_profiles USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_profiles_on_practice_id_and_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_profiles_on_practice_id_and_version ON public.clinic_inventory_profiles USING btree (practice_id, version);


--
-- Name: index_clinic_inventory_purchase_carts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_purchase_carts_on_practice_id_and_id ON public.clinic_inventory_purchase_carts USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_purchase_orders_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_purchase_orders_on_practice_id_and_id ON public.clinic_inventory_purchase_orders USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_recall_lots_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_recall_lots_on_practice_id_and_id ON public.clinic_inventory_recall_lots USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_recalls_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_recalls_on_practice_id_and_id ON public.clinic_inventory_recalls USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_receipt_lines_on_batch_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_inventory_receipt_lines_on_batch_id_and_id ON public.clinic_inventory_receipt_lines USING btree (batch_id, id);


--
-- Name: index_clinic_inventory_receipt_lines_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_receipt_lines_on_practice_id_and_id ON public.clinic_inventory_receipt_lines USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_receipts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_receipts_on_practice_id_and_id ON public.clinic_inventory_receipts USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_shipments_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_shipments_on_practice_id_and_id ON public.clinic_inventory_shipments USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_supplier_credits_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_supplier_credits_on_practice_id_and_id ON public.clinic_inventory_supplier_credits USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_supplier_invoices_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_supplier_invoices_on_practice_id_and_id ON public.clinic_inventory_supplier_invoices USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_supplier_invoices_on_supersedes_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_supplier_invoices_on_supersedes_id ON public.clinic_inventory_supplier_invoices USING btree (supersedes_id);


--
-- Name: index_clinic_inventory_supplier_products_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_supplier_products_on_practice_id_and_id ON public.clinic_inventory_supplier_products USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_suppliers_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_suppliers_on_practice_id_and_id ON public.clinic_inventory_suppliers USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_suppliers_on_practice_id_and_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_suppliers_on_practice_id_and_name ON public.clinic_inventory_suppliers USING btree (practice_id, name);


--
-- Name: index_clinic_inventory_transfers_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_transfers_on_practice_id_and_id ON public.clinic_inventory_transfers USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_vendor_returns_on_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_vendor_returns_on_entry_id ON public.clinic_inventory_vendor_returns USING btree (entry_id);


--
-- Name: index_clinic_inventory_vendor_returns_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_vendor_returns_on_practice_id_and_id ON public.clinic_inventory_vendor_returns USING btree (practice_id, id);


--
-- Name: index_clinic_invoice_stripe_checkouts_on_collection_intent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_invoice_stripe_checkouts_on_collection_intent_id ON public.clinic_invoice_stripe_checkouts USING btree (collection_intent_id);


--
-- Name: index_clinic_invoice_stripe_checkouts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_invoice_stripe_checkouts_on_practice_id_and_id ON public.clinic_invoice_stripe_checkouts USING btree (practice_id, id);


--
-- Name: index_clinic_items_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_items_on_practice_id ON public.clinic_items USING btree (practice_id);


--
-- Name: index_clinic_items_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_items_on_practice_id_and_id ON public.clinic_items USING btree (practice_id, id);


--
-- Name: index_clinic_items_on_practice_id_and_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_items_on_practice_id_and_sku ON public.clinic_items USING btree (practice_id, sku);


--
-- Name: index_clinic_memberships_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_memberships_on_practice_id ON public.clinic_memberships USING btree (practice_id);


--
-- Name: index_clinic_memberships_on_practice_id_and_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_memberships_on_practice_id_and_user_id ON public.clinic_memberships USING btree (practice_id, user_id);


--
-- Name: index_clinic_memberships_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_memberships_on_user_id ON public.clinic_memberships USING btree (user_id);


--
-- Name: index_clinic_notes_on_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_notes_on_author_id ON public.clinic_notes USING btree (author_id);


--
-- Name: index_clinic_notes_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_notes_on_practice_id ON public.clinic_notes USING btree (practice_id);


--
-- Name: index_clinic_notes_on_practice_id_and_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_notes_on_practice_id_and_patient_id ON public.clinic_notes USING btree (practice_id, patient_id);


--
-- Name: index_clinic_patient_reminder_actions_on_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminder_actions_on_actor_id ON public.clinic_patient_reminder_actions USING btree (actor_id);


--
-- Name: index_clinic_patient_reminder_actions_on_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminder_actions_on_patient_id ON public.clinic_patient_reminder_actions USING btree (patient_id);


--
-- Name: index_clinic_patient_reminder_actions_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminder_actions_on_practice_id ON public.clinic_patient_reminder_actions USING btree (practice_id);


--
-- Name: index_clinic_patient_reminder_actions_on_reminder_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminder_actions_on_reminder_id ON public.clinic_patient_reminder_actions USING btree (reminder_id);


--
-- Name: index_clinic_patient_reminder_delivery_attempts_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminder_delivery_attempts_on_practice_id ON public.clinic_patient_reminder_delivery_attempts USING btree (practice_id);


--
-- Name: index_clinic_patient_reminder_delivery_attempts_on_reminder_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminder_delivery_attempts_on_reminder_id ON public.clinic_patient_reminder_delivery_attempts USING btree (reminder_id);


--
-- Name: index_clinic_patient_reminder_outbox_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminder_outbox_on_practice_id ON public.clinic_patient_reminder_outbox USING btree (practice_id);


--
-- Name: index_clinic_patient_reminder_outbox_on_reminder_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminder_outbox_on_reminder_id ON public.clinic_patient_reminder_outbox USING btree (reminder_id);


--
-- Name: index_clinic_patient_reminders_on_communication_endpoint_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminders_on_communication_endpoint_id ON public.clinic_patient_reminders USING btree (communication_endpoint_id);


--
-- Name: index_clinic_patient_reminders_on_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminders_on_patient_id ON public.clinic_patient_reminders USING btree (patient_id);


--
-- Name: index_clinic_patient_reminders_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patient_reminders_on_practice_id ON public.clinic_patient_reminders USING btree (practice_id);


--
-- Name: index_clinic_patients_on_name_search_tokens; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patients_on_name_search_tokens ON public.clinic_patients USING gin (name_search_tokens);


--
-- Name: index_clinic_patients_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_patients_on_practice_id ON public.clinic_patients USING btree (practice_id);


--
-- Name: index_clinic_patients_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_patients_on_practice_id_and_id ON public.clinic_patients USING btree (practice_id, id);


--
-- Name: index_clinic_patients_on_practice_id_and_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_patients_on_practice_id_and_reference ON public.clinic_patients USING btree (practice_id, reference);


--
-- Name: index_clinic_payment_allocations_on_practice_id_and_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_payment_allocations_on_practice_id_and_invoice_id ON public.clinic_payment_allocations USING btree (practice_id, invoice_id);


--
-- Name: index_clinic_pharmacy_batch_events_on_practice_id_and_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_pharmacy_batch_events_on_practice_id_and_batch_id ON public.clinic_pharmacy_batch_events USING btree (practice_id, batch_id);


--
-- Name: index_clinic_pharmacy_batches_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_pharmacy_batches_on_practice_id ON public.clinic_pharmacy_batches USING btree (practice_id);


--
-- Name: index_clinic_pharmacy_batches_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_pharmacy_batches_on_practice_id_and_id ON public.clinic_pharmacy_batches USING btree (practice_id, id);


--
-- Name: index_clinic_pharmacy_movements_on_practice_id_and_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_pharmacy_movements_on_practice_id_and_batch_id ON public.clinic_pharmacy_movements USING btree (practice_id, batch_id);


--
-- Name: index_clinic_pharmacy_movements_on_practice_id_and_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_pharmacy_movements_on_practice_id_and_request_key ON public.clinic_pharmacy_movements USING btree (practice_id, request_key);


--
-- Name: index_clinic_pharmacy_products_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_pharmacy_products_on_practice_id ON public.clinic_pharmacy_products USING btree (practice_id);


--
-- Name: index_clinic_pharmacy_products_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_pharmacy_products_on_practice_id_and_id ON public.clinic_pharmacy_products USING btree (practice_id, id);


--
-- Name: index_clinic_pharmacy_products_on_practice_id_and_ndc; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_pharmacy_products_on_practice_id_and_ndc ON public.clinic_pharmacy_products USING btree (practice_id, ndc);


--
-- Name: index_clinic_pharmacy_products_on_practice_id_and_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_pharmacy_products_on_practice_id_and_sku ON public.clinic_pharmacy_products USING btree (practice_id, sku);


--
-- Name: index_clinic_practices_on_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_practices_on_organization_id ON public.clinic_practices USING btree (organization_id);


--
-- Name: index_clinic_scribe_encounters_on_practice_id_and_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_scribe_encounters_on_practice_id_and_status ON public.clinic_scribe_encounters USING btree (practice_id, status);


--
-- Name: index_clinic_service_options_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_service_options_on_practice_id_and_id ON public.clinic_service_options USING btree (practice_id, id);


--
-- Name: index_clinic_staff_members_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_staff_members_on_practice_id ON public.clinic_staff_members USING btree (practice_id);


--
-- Name: index_clinic_stock_movements_on_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_stock_movements_on_actor_id ON public.clinic_stock_movements USING btree (actor_id);


--
-- Name: index_clinic_stock_movements_on_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_stock_movements_on_item_id ON public.clinic_stock_movements USING btree (item_id);


--
-- Name: index_clinic_stock_movements_on_item_id_and_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stock_movements_on_item_id_and_request_key ON public.clinic_stock_movements USING btree (item_id, request_key);


--
-- Name: index_clinic_stripe_checkouts_on_account_id_and_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stripe_checkouts_on_account_id_and_session_id ON public.clinic_stripe_checkouts USING btree (account_id, session_id);


--
-- Name: index_clinic_stripe_checkouts_on_agreement_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stripe_checkouts_on_agreement_id ON public.clinic_stripe_checkouts USING btree (agreement_id);


--
-- Name: index_clinic_stripe_checkouts_on_collection_intent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stripe_checkouts_on_collection_intent_id ON public.clinic_stripe_checkouts USING btree (collection_intent_id);


--
-- Name: index_clinic_stripe_checkouts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stripe_checkouts_on_practice_id_and_id ON public.clinic_stripe_checkouts USING btree (practice_id, id);


--
-- Name: index_clinic_stripe_connections_on_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stripe_connections_on_account_id ON public.clinic_stripe_connections USING btree (account_id);


--
-- Name: index_clinic_stripe_connections_on_connected_by_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_stripe_connections_on_connected_by_id ON public.clinic_stripe_connections USING btree (connected_by_id);


--
-- Name: index_clinic_stripe_connections_on_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stripe_connections_on_practice_id ON public.clinic_stripe_connections USING btree (practice_id);


--
-- Name: index_clinic_stripe_connections_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stripe_connections_on_practice_id_and_id ON public.clinic_stripe_connections USING btree (practice_id, id);


--
-- Name: index_clinic_stripe_connections_on_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_stripe_connections_on_reference ON public.clinic_stripe_connections USING btree (reference);


--
-- Name: index_clinic_subscription_agreements_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_subscription_agreements_on_practice_id_and_id ON public.clinic_subscription_agreements USING btree (practice_id, id);


--
-- Name: index_clinic_subscription_events_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_subscription_events_on_practice_id_and_id ON public.clinic_subscription_events USING btree (practice_id, id);


--
-- Name: index_clinic_subscription_families_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_subscription_families_on_practice_id_and_id ON public.clinic_subscription_families USING btree (practice_id, id);


--
-- Name: index_clinic_subscription_packages_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_subscription_packages_on_practice_id_and_id ON public.clinic_subscription_packages USING btree (practice_id, id);


--
-- Name: index_clinic_subscription_versions_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_subscription_versions_on_practice_id_and_id ON public.clinic_subscription_versions USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_checkins_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_checkins_on_practice_id_and_id ON public.clinic_telehealth_checkins USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_commands_on_practice_id_and_dedupe_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_commands_on_practice_id_and_dedupe_key ON public.clinic_telehealth_commands USING btree (practice_id, dedupe_key);


--
-- Name: index_clinic_telehealth_commands_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_commands_on_practice_id_and_id ON public.clinic_telehealth_commands USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_commands_on_status_and_available_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_telehealth_commands_on_status_and_available_at ON public.clinic_telehealth_commands USING btree (status, available_at);


--
-- Name: index_clinic_telehealth_consents_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_consents_on_practice_id_and_id ON public.clinic_telehealth_consents USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_join_grants_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_join_grants_on_practice_id_and_id ON public.clinic_telehealth_join_grants USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_join_grants_on_token_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_telehealth_join_grants_on_token_digest ON public.clinic_telehealth_join_grants USING btree (token_digest);


--
-- Name: index_clinic_telehealth_participants_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_participants_on_practice_id_and_id ON public.clinic_telehealth_participants USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_participants_on_provider_subject_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_participants_on_provider_subject_id ON public.clinic_telehealth_participants USING btree (provider_subject_id);


--
-- Name: index_clinic_telehealth_patient_receipts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_patient_receipts_on_practice_id_and_id ON public.clinic_telehealth_patient_receipts USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_policy_versions_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_policy_versions_on_practice_id_and_id ON public.clinic_telehealth_policy_versions USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_provider_events_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_provider_events_on_practice_id_and_id ON public.clinic_telehealth_provider_events USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_room_attempts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_room_attempts_on_practice_id_and_id ON public.clinic_telehealth_room_attempts USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_settings_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_settings_on_practice_id_and_id ON public.clinic_telehealth_settings USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_visit_type_rules_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_visit_type_rules_on_practice_id_and_id ON public.clinic_telehealth_visit_type_rules USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_visits_on_practice_id_and_encounter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_visits_on_practice_id_and_encounter_id ON public.clinic_telehealth_visits USING btree (practice_id, encounter_id) WHERE (encounter_id IS NOT NULL);


--
-- Name: index_clinic_telehealth_visits_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_visits_on_practice_id_and_id ON public.clinic_telehealth_visits USING btree (practice_id, id);


--
-- Name: index_clinic_telehealth_visits_on_public_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_telehealth_visits_on_public_id ON public.clinic_telehealth_visits USING btree (public_id);


--
-- Name: index_clinic_workforce_badge_credentials_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_badge_credentials_on_practice_id_and_id ON public.clinic_workforce_badge_credentials USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_badge_credentials_on_secret_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_badge_credentials_on_secret_digest ON public.clinic_workforce_badge_credentials USING btree (secret_digest);


--
-- Name: index_clinic_workforce_employee_invitations_on_role_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_clinic_workforce_employee_invitations_on_role_version_id ON public.clinic_workforce_employee_invitations USING btree (role_version_id);


--
-- Name: index_clinic_workforce_employment_sites_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_employment_sites_on_practice_id_and_id ON public.clinic_workforce_employment_sites USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_employments_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_employments_on_practice_id_and_id ON public.clinic_workforce_employments USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_kiosk_enrollments_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_kiosk_enrollments_on_practice_id_and_id ON public.clinic_workforce_kiosk_enrollments USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_kiosk_enrollments_on_token_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_kiosk_enrollments_on_token_digest ON public.clinic_workforce_kiosk_enrollments USING btree (token_digest);


--
-- Name: index_clinic_workforce_kiosk_sessions_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_kiosk_sessions_on_practice_id_and_id ON public.clinic_workforce_kiosk_sessions USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_kiosk_sessions_on_session_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_kiosk_sessions_on_session_digest ON public.clinic_workforce_kiosk_sessions USING btree (session_digest);


--
-- Name: index_clinic_workforce_punch_challenges_on_challenge_digest; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_punch_challenges_on_challenge_digest ON public.clinic_workforce_punch_challenges USING btree (challenge_digest);


--
-- Name: index_clinic_workforce_punch_challenges_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_punch_challenges_on_practice_id_and_id ON public.clinic_workforce_punch_challenges USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_punches_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_punches_on_practice_id_and_id ON public.clinic_workforce_punches USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_punches_on_practice_id_and_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_punches_on_practice_id_and_request_key ON public.clinic_workforce_punches USING btree (practice_id, request_key);


--
-- Name: index_clinic_workforce_schedule_drafts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_schedule_drafts_on_practice_id_and_id ON public.clinic_workforce_schedule_drafts USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_settings_versions_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_settings_versions_on_practice_id_and_id ON public.clinic_workforce_settings_versions USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_shifts_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_shifts_on_practice_id_and_id ON public.clinic_workforce_shifts USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_shifts_on_practice_id_and_public_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_shifts_on_practice_id_and_public_id ON public.clinic_workforce_shifts USING btree (practice_id, public_id);


--
-- Name: index_clinic_workforce_time_off_requests_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_time_off_requests_on_practice_id_and_id ON public.clinic_workforce_time_off_requests USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_time_segments_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_time_segments_on_practice_id_and_id ON public.clinic_workforce_time_segments USING btree (practice_id, id);


--
-- Name: index_clinic_workforce_timecard_versions_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_workforce_timecard_versions_on_practice_id_and_id ON public.clinic_workforce_timecard_versions USING btree (practice_id, id);


--
-- Name: index_credit_notes_on_practice_and_issuer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_credit_notes_on_practice_and_issuer ON public.clinic_credit_notes USING btree (practice_id, issued_by_membership_id);


--
-- Name: index_identity_login_throttles_on_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_identity_login_throttles_on_expires_at ON public.identity_login_throttles USING btree (expires_at);


--
-- Name: index_identity_preferences_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_identity_preferences_on_user_id ON public.identity_preferences USING btree (user_id);


--
-- Name: index_invoices_on_practice_and_voider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_invoices_on_practice_and_voider ON public.clinic_invoices USING btree (practice_id, voided_by_membership_id);


--
-- Name: index_learning_progresses_on_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_progresses_on_material_id ON public.learning_progresses USING btree (material_id);


--
-- Name: index_learning_progresses_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_progresses_on_user_id ON public.learning_progresses USING btree (user_id);


--
-- Name: index_learning_progresses_on_user_id_and_material_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_learning_progresses_on_user_id_and_material_id ON public.learning_progresses USING btree (user_id, material_id);


--
-- Name: index_materials_on_published_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_materials_on_published_at ON public.materials USING btree (published_at);


--
-- Name: index_materials_on_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_materials_on_slug ON public.materials USING btree (slug);


--
-- Name: index_member_sessions_on_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_member_sessions_on_expires_at ON public.member_sessions USING btree (expires_at);


--
-- Name: index_member_sessions_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_member_sessions_on_user_id ON public.member_sessions USING btree (user_id);


--
-- Name: index_paperworks_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_paperworks_on_user_id ON public.paperworks USING btree (user_id);


--
-- Name: index_users_on_email_address; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_users_on_email_address ON public.users USING btree (email_address);


--
-- Name: inventory_control_review_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_control_review_kind ON public.clinic_inventory_control_reviews USING btree (practice_id, count_id, kind);


--
-- Name: inventory_control_review_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_control_review_retry ON public.clinic_inventory_control_reviews USING btree (practice_id, request_key);


--
-- Name: inventory_count_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_retry ON public.clinic_inventory_counts USING btree (practice_id, request_key);


--
-- Name: inventory_count_session_event_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_session_event_retry ON public.clinic_inventory_count_session_events USING btree (practice_id, request_key);


--
-- Name: inventory_count_session_events_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_count_session_events_history ON public.clinic_inventory_count_session_events USING btree (practice_id, count_session_id, id DESC);


--
-- Name: inventory_count_session_events_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_session_events_practice_id ON public.clinic_inventory_count_session_events USING btree (practice_id, id);


--
-- Name: inventory_count_session_line_events; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_count_session_line_events ON public.clinic_inventory_count_session_events USING btree (practice_id, count_session_line_id, id DESC);


--
-- Name: inventory_count_session_line_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_session_line_scope ON public.clinic_inventory_count_session_lines USING btree (practice_id, count_session_id, batch_id);


--
-- Name: inventory_count_session_lines_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_session_lines_practice_id ON public.clinic_inventory_count_session_lines USING btree (practice_id, id);


--
-- Name: inventory_count_session_lines_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_count_session_lines_worklist ON public.clinic_inventory_count_session_lines USING btree (practice_id, count_session_id, id);


--
-- Name: inventory_count_session_open_bin; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_session_open_bin ON public.clinic_inventory_count_sessions USING btree (practice_id, location_id) WHERE ((status)::text = 'open'::text);


--
-- Name: inventory_count_session_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_session_retry ON public.clinic_inventory_count_sessions USING btree (practice_id, request_key);


--
-- Name: inventory_count_sessions_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_sessions_practice_id ON public.clinic_inventory_count_sessions USING btree (practice_id, id);


--
-- Name: inventory_counts_session_line_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_counts_session_line_history ON public.clinic_inventory_counts USING btree (practice_id, count_session_line_id, id);


--
-- Name: inventory_disposition_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_disposition_retry ON public.clinic_inventory_recall_dispositions USING btree (practice_id, request_key);


--
-- Name: inventory_entry_disposition_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_entry_disposition_once ON public.clinic_inventory_entries USING btree (recall_disposition_id) WHERE (recall_disposition_id IS NOT NULL);


--
-- Name: inventory_entry_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_entry_retry ON public.clinic_inventory_entries USING btree (practice_id, request_key);


--
-- Name: inventory_entry_transfer_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_entry_transfer_once ON public.clinic_inventory_entries USING btree (transfer_id, kind) WHERE (transfer_id IS NOT NULL);


--
-- Name: inventory_exception_review_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_exception_review_latest ON public.clinic_inventory_exception_reviews USING btree (practice_id, source_kind, source_id, category, id DESC);


--
-- Name: inventory_exception_review_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_exception_review_retry ON public.clinic_inventory_exception_reviews USING btree (practice_id, request_key);


--
-- Name: inventory_exception_reviews_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_exception_reviews_practice_id ON public.clinic_inventory_exception_reviews USING btree (practice_id, id);


--
-- Name: inventory_expiry_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_expiry_worklist ON public.clinic_pharmacy_batches USING btree (practice_id, expires_on, id);


--
-- Name: inventory_hold_recall_batch_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_hold_recall_batch_history ON public.clinic_inventory_holds USING btree (recall_id, batch_id, id) WHERE (recall_id IS NOT NULL);


--
-- Name: inventory_hold_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_hold_retry ON public.clinic_inventory_holds USING btree (practice_id, request_key);


--
-- Name: inventory_hold_transfer_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_hold_transfer_once ON public.clinic_inventory_holds USING btree (transfer_id) WHERE (transfer_id IS NOT NULL);


--
-- Name: inventory_location_children; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_location_children ON public.clinic_inventory_locations USING btree (practice_id, parent_location_id, status, id);


--
-- Name: inventory_location_sibling_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_location_sibling_name ON public.clinic_inventory_locations USING btree (practice_id, site_id, parent_location_id, name) NULLS NOT DISTINCT;


--
-- Name: inventory_location_site_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_location_site_worklist ON public.clinic_inventory_locations USING btree (practice_id, site_id, status, id);


--
-- Name: inventory_lot_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_lot_identity ON public.clinic_inventory_lots USING btree (practice_id, product_id, number);


--
-- Name: inventory_position_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_position_identity ON public.clinic_pharmacy_batches USING btree (practice_id, lot_id, location_id);


--
-- Name: inventory_purchase_cart_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_cart_active ON public.clinic_inventory_purchase_carts USING btree (practice_id, actor_id) WHERE ((status)::text = 'draft'::text);


--
-- Name: inventory_purchase_cart_checkout_group; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_cart_checkout_group ON public.clinic_inventory_purchase_carts USING btree (practice_id, checkout_group_id) WHERE (checkout_group_id IS NOT NULL);


--
-- Name: inventory_purchase_cart_item_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_cart_item_identity ON public.clinic_inventory_purchase_cart_items USING btree (practice_id, cart_id, product_id);


--
-- Name: inventory_purchase_cart_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_cart_retry ON public.clinic_inventory_purchase_carts USING btree (practice_id, request_key) WHERE (request_key IS NOT NULL);


--
-- Name: inventory_purchase_order_event_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_order_event_retry ON public.clinic_inventory_purchase_order_events USING btree (practice_id, request_key);


--
-- Name: inventory_purchase_order_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_order_identity ON public.clinic_inventory_purchase_orders USING btree (practice_id, number);


--
-- Name: inventory_purchase_order_line_cart_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_order_line_cart_item ON public.clinic_inventory_purchase_order_lines USING btree (practice_id, cart_item_id) WHERE (cart_item_id IS NOT NULL);


--
-- Name: inventory_purchase_order_line_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_purchase_order_line_order ON public.clinic_inventory_purchase_order_lines USING btree (purchase_order_id, id);


--
-- Name: inventory_purchase_order_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_order_retry ON public.clinic_inventory_purchase_orders USING btree (practice_id, request_key);


--
-- Name: inventory_purchase_orders_receiving_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_purchase_orders_receiving_site ON public.clinic_inventory_purchase_orders USING btree (practice_id, receiving_site_id);


--
-- Name: inventory_recall_closure_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_recall_closure_once ON public.clinic_inventory_recall_closures USING btree (practice_id, recall_id);


--
-- Name: inventory_recall_closure_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_recall_closure_retry ON public.clinic_inventory_recall_closures USING btree (practice_id, request_key);


--
-- Name: inventory_recall_closures_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_recall_closures_practice_id ON public.clinic_inventory_recall_closures USING btree (practice_id, id);


--
-- Name: inventory_recall_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_recall_identity ON public.clinic_inventory_recalls USING btree (practice_id, reference);


--
-- Name: inventory_recall_lot_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_recall_lot_identity ON public.clinic_inventory_recall_lots USING btree (practice_id, recall_id, lot_id);


--
-- Name: inventory_recall_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_recall_retry ON public.clinic_inventory_recalls USING btree (practice_id, request_key);


--
-- Name: inventory_receipt_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_receipt_retry ON public.clinic_inventory_receipts USING btree (practice_id, request_key);


--
-- Name: inventory_receipt_shipment_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_receipt_shipment_once ON public.clinic_inventory_receipts USING btree (practice_id, shipment_id) WHERE (shipment_id IS NOT NULL);


--
-- Name: inventory_release_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_release_retry ON public.clinic_inventory_hold_releases USING btree (practice_id, request_key);


--
-- Name: inventory_shipment_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_shipment_identity ON public.clinic_inventory_shipments USING btree (practice_id, reference);


--
-- Name: inventory_shipment_line_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_shipment_line_identity ON public.clinic_inventory_shipment_lines USING btree (practice_id, shipment_id);


--
-- Name: inventory_shipment_reconciliation_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_shipment_reconciliation_once ON public.clinic_inventory_shipment_reconciliations USING btree (practice_id, shipment_id);


--
-- Name: inventory_shipment_reconciliation_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_shipment_reconciliation_retry ON public.clinic_inventory_shipment_reconciliations USING btree (practice_id, request_key);


--
-- Name: inventory_shipment_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_shipment_retry ON public.clinic_inventory_shipments USING btree (practice_id, request_key);


--
-- Name: inventory_supplier_product_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_supplier_product_identity ON public.clinic_inventory_supplier_products USING btree (practice_id, supplier_id, ndc, supplier_sku);


--
-- Name: inventory_transfer_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_transfer_retry ON public.clinic_inventory_transfers USING btree (practice_id, request_key);


--
-- Name: permissions_action_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_action_code ON public.permissions USING btree (action_code);


--
-- Name: role_version_permissions_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_version_permissions_identity ON public.role_version_permissions USING btree (role_version_id, permission_id);


--
-- Name: role_versions_code_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_versions_code_version ON public.role_versions USING btree (role_code, version);


--
-- Name: scribe_documents_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_documents_practice_id ON public.clinic_scribe_documents USING btree (practice_id, id);


--
-- Name: scribe_documents_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_documents_scope ON public.clinic_scribe_documents USING btree (practice_id, encounter_id, id);


--
-- Name: scribe_draft_sections_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_draft_sections_key ON public.clinic_scribe_draft_sections USING btree (practice_id, draft_id, section_key);


--
-- Name: scribe_drafts_document_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_drafts_document_id ON public.clinic_scribe_drafts USING btree (practice_id, document_id, id);


--
-- Name: scribe_drafts_document_revision; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_drafts_document_revision ON public.clinic_scribe_drafts USING btree (practice_id, document_id, revision_number);


--
-- Name: scribe_exports_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_exports_idempotency ON public.clinic_scribe_exports USING btree (practice_id, idempotency_key);


--
-- Name: scribe_note_templates_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_note_templates_identity ON public.clinic_scribe_note_templates USING btree (template_id, version);


--
-- Name: scribe_recording_chunks_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_recording_chunks_sequence ON public.clinic_scribe_recording_chunks USING btree (practice_id, recording_id, sequence);


--
-- Name: scribe_recordings_encounter_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scribe_recordings_encounter_status ON public.clinic_scribe_recordings USING btree (practice_id, encounter_id, status);


--
-- Name: scribe_recordings_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_recordings_idempotency ON public.clinic_scribe_recordings USING btree (practice_id, idempotency_key);


--
-- Name: scribe_recordings_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_recordings_practice_id ON public.clinic_scribe_recordings USING btree (practice_id, id);


--
-- Name: scribe_recordings_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_recordings_scope ON public.clinic_scribe_recordings USING btree (practice_id, encounter_id, id);


--
-- Name: scribe_source_segments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX scribe_source_segments_order ON public.clinic_scribe_source_segments USING btree (practice_id, source_id, sequence);


--
-- Name: stripe_cycle_payment_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stripe_cycle_payment_identity ON public.clinic_stripe_membership_cycles USING btree (checkout_id, provider_payment_id);


--
-- Name: stripe_cycle_provider_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stripe_cycle_provider_identity ON public.clinic_stripe_membership_cycles USING btree (checkout_id, provider_invoice_id);


--
-- Name: subscription_event_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscription_event_request ON public.clinic_subscription_events USING btree (practice_id, agreement_id, request_key);


--
-- Name: subscription_purchase_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscription_purchase_invoice ON public.clinic_subscription_agreements USING btree (practice_id, invoice_id);


--
-- Name: subscription_purchase_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscription_purchase_request ON public.clinic_subscription_agreements USING btree (practice_id, patient_id, request_key);


--
-- Name: subscription_version_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscription_version_number ON public.clinic_subscription_versions USING btree (practice_id, package_id, number);


--
-- Name: subscription_version_package_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscription_version_package_identity ON public.clinic_subscription_versions USING btree (practice_id, package_id, id);


--
-- Name: subscription_version_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subscription_version_request ON public.clinic_subscription_versions USING btree (practice_id, request_key);


--
-- Name: supplier_credit_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplier_credit_reference ON public.clinic_inventory_supplier_credits USING btree (practice_id, purchase_order_id, reference);


--
-- Name: supplier_invoice_matched_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX supplier_invoice_matched_reference ON public.clinic_inventory_supplier_invoices USING btree (practice_id, purchase_order_id, reference) WHERE ((status)::text = 'matched'::text);


--
-- Name: verify_fk_05e55ba80c441f84; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_05e55ba80c441f84 ON public.clinic_encounter_note_revisions USING btree (practice_id, author_membership_id);


--
-- Name: verify_fk_14e7158268b15cfb; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_14e7158268b15cfb ON public.clinic_message_attachments USING btree (practice_id, patient_id, document_id);


--
-- Name: verify_fk_2f36435c9c409f53; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_2f36435c9c409f53 ON public.clinic_observation_sources USING btree (practice_id, patient_id, source_observation_id);


--
-- Name: verify_fk_319afa301b7ecc89; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_319afa301b7ecc89 ON public.clinic_role_grants USING btree (practice_id, site_id);


--
-- Name: verify_fk_3345c08012f0b626; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_3345c08012f0b626 ON public.clinic_encounters USING btree (practice_id, patient_id, appointment_id);


--
-- Name: verify_fk_424a7d469349f51a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_424a7d469349f51a ON public.clinic_observations USING btree (practice_id, patient_id, encounter_id);


--
-- Name: verify_fk_49601f2b7931a479; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_49601f2b7931a479 ON public.clinic_invoice_lines USING btree (practice_id, patient_id, invoice_id);


--
-- Name: verify_fk_574a9539ab4421d1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_574a9539ab4421d1 ON public.role_version_permissions USING btree (permission_id);


--
-- Name: verify_fk_61fe34589c16b346; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_61fe34589c16b346 ON public.clinic_encounter_note_revisions USING btree (practice_id, note_id, prior_revision_id);


--
-- Name: verify_fk_63186da3066c4b0b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_63186da3066c4b0b ON public.clinic_observation_sources USING btree (practice_id, patient_id, derived_observation_id);


--
-- Name: verify_fk_673e1be8421af39a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_673e1be8421af39a ON public.clinic_documents USING btree (practice_id, category_id);


--
-- Name: verify_fk_78440b5717b94c15; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_78440b5717b94c15 ON public.clinic_encounters USING btree (practice_id, site_id, room_id);


--
-- Name: verify_fk_89e6ddbe1366e57a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_89e6ddbe1366e57a ON public.clinic_observations USING btree (practice_id, author_membership_id);


--
-- Name: verify_fk_8babd52a3e159577; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_8babd52a3e159577 ON public.clinic_message_attachments USING btree (practice_id, patient_id, message_intent_id);


--
-- Name: verify_fk_8e20bf37ea73eb75; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_8e20bf37ea73eb75 ON public.clinic_appointments USING btree (practice_id, site_id, room_id);


--
-- Name: verify_fk_9044ba684ce3d830; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_9044ba684ce3d830 ON public.clinic_encounter_note_signatures USING btree (practice_id, signer_membership_id);


--
-- Name: verify_fk_9b173034a584a9e7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_9b173034a584a9e7 ON public.clinic_refund_events USING btree (practice_id, patient_id);


--
-- Name: verify_fk_af4339bd977d3fd5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_af4339bd977d3fd5 ON public.clinic_credit_notes USING btree (practice_id, patient_id, invoice_id);


--
-- Name: verify_fk_bf9c3e527269d842; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_bf9c3e527269d842 ON public.clinic_appointments USING btree (practice_id, visit_type_id);


--
-- Name: verify_fk_c1179afd5b0a40d5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_c1179afd5b0a40d5 ON public.clinic_encounter_participants USING btree (practice_id, patient_id, encounter_id);


--
-- Name: verify_fk_c813f106df235365; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_c813f106df235365 ON public.clinic_observations USING btree (practice_id, patient_id, parent_observation_id);


--
-- Name: verify_fk_cf68d7fced7a04cc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_cf68d7fced7a04cc ON public.clinic_encounter_notes USING btree (practice_id, patient_id, encounter_id);


--
-- Name: verify_fk_d1f26d9eae75d2e7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_d1f26d9eae75d2e7 ON public.clinic_insurance_claims USING btree (practice_id, patient_id, coverage_version_id);


--
-- Name: verify_fk_d2e868c6d555e796; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_d2e868c6d555e796 ON public.clinic_refund_events USING btree (practice_id, patient_id, payment_event_id);


--
-- Name: verify_fk_dbd5f51b73eaaf39; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_dbd5f51b73eaaf39 ON public.clinic_clinician_assignments USING btree (practice_id, department_id);


--
-- Name: verify_fk_ed52a7441d37d530; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_ed52a7441d37d530 ON public.clinic_documents USING btree (practice_id, patient_id, encounter_id);


--
-- Name: verify_fk_eecceb7f2094ff07; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_eecceb7f2094ff07 ON public.clinic_insurance_claims USING btree (practice_id, patient_id, invoice_id);


--
-- Name: verify_fk_efcb45f7bc4e511d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verify_fk_efcb45f7bc4e511d ON public.clinic_role_grants USING btree (role_version_id);


--
-- Name: wf_export_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wf_export_retry ON public.clinic_workforce_export_batches USING btree (practice_id, request_key);


--
-- Name: wf_export_single_successor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wf_export_single_successor ON public.clinic_workforce_export_batches USING btree (supersedes_batch_id) WHERE (supersedes_batch_id IS NOT NULL);


--
-- Name: wf_export_site_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wf_export_site_history ON public.clinic_workforce_export_batches USING btree (practice_id, site_id, created_at);


--
-- Name: wf_export_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wf_export_tenant_id ON public.clinic_workforce_export_batches USING btree (practice_id, id);


--
-- Name: wf_payroll_config_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wf_payroll_config_effective ON public.clinic_workforce_payroll_configuration_versions USING btree (practice_id, site_id, effective_from);


--
-- Name: wf_payroll_config_revision; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wf_payroll_config_revision ON public.clinic_workforce_payroll_configuration_versions USING btree (practice_id, site_id, revision);


--
-- Name: wf_payroll_config_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX wf_payroll_config_tenant_id ON public.clinic_workforce_payroll_configuration_versions USING btree (practice_id, id);


--
-- Name: workforce_assignment_open_interval; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_assignment_open_interval ON public.clinic_workforce_employment_sites USING btree (practice_id, employment_id, site_id) WHERE (effective_until IS NULL);


--
-- Name: workforce_availability_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_availability_current ON public.clinic_workforce_availability_versions USING btree (practice_id, site_id, employment_id) WHERE ((status)::text = 'approved'::text);


--
-- Name: workforce_employee_invitations_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_employee_invitations_email ON public.clinic_workforce_employee_invitations USING btree (email_digest) WHERE (email_digest IS NOT NULL);


--
-- Name: workforce_employee_invitations_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_employee_invitations_staff ON public.clinic_workforce_employee_invitations USING btree (practice_id, staff_member_id);


--
-- Name: workforce_employee_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_employee_invitations_token ON public.clinic_workforce_employee_invitations USING btree (token_digest) WHERE (token_digest IS NOT NULL);


--
-- Name: workforce_employment_sites_eligibility; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_employment_sites_eligibility ON public.clinic_workforce_employment_sites USING btree (practice_id, site_id, active);


--
-- Name: workforce_employments_membership; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_employments_membership ON public.clinic_workforce_employments USING btree (practice_id, membership_id);


--
-- Name: workforce_employments_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_employments_staff ON public.clinic_workforce_employments USING btree (practice_id, staff_member_id);


--
-- Name: workforce_practice_settings_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_practice_settings_effective ON public.clinic_workforce_settings_versions USING btree (practice_id, effective_from) WHERE (site_id IS NULL);


--
-- Name: workforce_practice_settings_revision; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_practice_settings_revision ON public.clinic_workforce_settings_versions USING btree (practice_id, revision) WHERE (site_id IS NULL);


--
-- Name: workforce_schedule_drafts_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_schedule_drafts_week ON public.clinic_workforce_schedule_drafts USING btree (practice_id, site_id, week_start_on, status);


--
-- Name: workforce_schedule_publications_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_schedule_publications_retry ON public.clinic_workforce_schedule_publications USING btree (practice_id, idempotency_key);


--
-- Name: workforce_schedule_publications_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_schedule_publications_version ON public.clinic_workforce_schedule_publications USING btree (practice_id, site_id, week_start_on, version);


--
-- Name: workforce_schedule_templates_active_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_schedule_templates_active_name ON public.clinic_workforce_schedule_templates USING btree (practice_id, site_id, name) WHERE active;


--
-- Name: workforce_shifts_employee_interval; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_shifts_employee_interval ON public.clinic_workforce_shifts USING btree (practice_id, employment_id, starts_at, ends_at);


--
-- Name: workforce_site_settings_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_site_settings_effective ON public.clinic_workforce_settings_versions USING btree (practice_id, site_id, effective_from) WHERE (site_id IS NOT NULL);


--
-- Name: workforce_site_settings_revision; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_site_settings_revision ON public.clinic_workforce_settings_versions USING btree (practice_id, site_id, revision) WHERE (site_id IS NOT NULL);


--
-- Name: clinic_allergies clinic_allergies_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_allergies_preserve_identity BEFORE UPDATE ON public.clinic_allergies FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id');


--
-- Name: clinic_appointments clinic_appointments_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_appointments_preserve_identity BEFORE UPDATE ON public.clinic_appointments FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id');


--
-- Name: clinic_audit_delivery_receipts clinic_audit_delivery_receipts_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_audit_delivery_receipts_immutable BEFORE DELETE OR UPDATE ON public.clinic_audit_delivery_receipts FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_audit_events clinic_audit_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_audit_events_immutable BEFORE DELETE OR UPDATE ON public.clinic_audit_events FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_audit_resource_manifests clinic_audit_resource_manifests_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_audit_resource_manifests_immutable BEFORE DELETE OR UPDATE ON public.clinic_audit_resource_manifests FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_clinician_assignments clinic_clinician_assignments_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_clinician_assignments_preserve_identity BEFORE UPDATE ON public.clinic_clinician_assignments FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'clinician_profile_id', 'department_id', 'site_id', 'effective_from');


--
-- Name: clinic_clinician_credentials clinic_clinician_credentials_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_clinician_credentials_preserve_identity BEFORE UPDATE ON public.clinic_clinician_credentials FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'clinician_profile_id');


--
-- Name: clinic_clinician_profiles clinic_clinician_profiles_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_clinician_profiles_preserve_identity BEFORE UPDATE ON public.clinic_clinician_profiles FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'membership_id');


--
-- Name: clinic_conditions clinic_conditions_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_conditions_preserve_identity BEFORE UPDATE ON public.clinic_conditions FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id');


--
-- Name: clinic_coverage_versions clinic_coverage_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_coverage_versions_immutable BEFORE DELETE OR UPDATE ON public.clinic_coverage_versions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_credit_notes clinic_credit_notes_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_credit_notes_immutable BEFORE DELETE OR UPDATE ON public.clinic_credit_notes FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_departments clinic_departments_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_departments_preserve_identity BEFORE UPDATE ON public.clinic_departments FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id');


--
-- Name: clinic_document_categories clinic_document_categories_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_document_categories_preserve_identity BEFORE UPDATE ON public.clinic_document_categories FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id');


--
-- Name: clinic_documents clinic_documents_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_documents_preserve_identity BEFORE UPDATE ON public.clinic_documents FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'encounter_id', 'object_key', 'object_version', 'checksum', 'byte_size', 'media_type');


--
-- Name: clinic_encounter_note_revisions clinic_encounter_note_revisions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_encounter_note_revisions_immutable BEFORE DELETE OR UPDATE ON public.clinic_encounter_note_revisions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_encounter_note_signatures clinic_encounter_note_signatures_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_encounter_note_signatures_immutable BEFORE DELETE OR UPDATE ON public.clinic_encounter_note_signatures FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_encounter_notes clinic_encounter_notes_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_encounter_notes_preserve_identity BEFORE UPDATE ON public.clinic_encounter_notes FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'encounter_id', 'note_kind');


--
-- Name: clinic_encounter_participants clinic_encounter_participants_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_encounter_participants_preserve_identity BEFORE UPDATE ON public.clinic_encounter_participants FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'encounter_id', 'membership_id', 'effective_from');


--
-- Name: clinic_encounter_precautions clinic_encounter_precautions_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_encounter_precautions_preserve_identity BEFORE UPDATE ON public.clinic_encounter_precautions FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'encounter_id', 'recorded_by_membership_id', 'recorded_at');


--
-- Name: clinic_encounters clinic_encounters_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_encounters_preserve_identity BEFORE UPDATE ON public.clinic_encounters FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'appointment_id');


--
-- Name: clinic_insurance_claims clinic_insurance_claims_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_insurance_claims_immutable BEFORE DELETE OR UPDATE ON public.clinic_insurance_claims FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_inventory_control_reviews clinic_inventory_control_reviews_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_inventory_control_reviews_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_control_reviews FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_purchase_order_events clinic_inventory_purchase_order_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_inventory_purchase_order_events_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_purchase_order_events FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_recall_dispositions clinic_inventory_recall_dispositions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_inventory_recall_dispositions_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_recall_dispositions FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_recall_lots clinic_inventory_recall_lots_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_inventory_recall_lots_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_recall_lots FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_transfers clinic_inventory_transfers_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_inventory_transfers_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_transfers FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_invoice_lines clinic_invoice_lines_editable_draft; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_invoice_lines_editable_draft BEFORE DELETE OR UPDATE ON public.clinic_invoice_lines FOR EACH ROW EXECUTE FUNCTION public.clinic_invoice_line_editable_draft();


--
-- Name: clinic_invoices clinic_invoices_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_invoices_preserve_identity BEFORE UPDATE ON public.clinic_invoices FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'currency', 'rounding_policy_version');


--
-- Name: clinic_invoices clinic_invoices_status_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_invoices_status_transition BEFORE UPDATE OF status ON public.clinic_invoices FOR EACH ROW EXECUTE FUNCTION public.clinic_enforce_invoice_status_transition();


--
-- Name: clinic_lab_report_versions clinic_lab_report_versions_protect; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_lab_report_versions_protect BEFORE DELETE OR UPDATE ON public.clinic_lab_report_versions FOR EACH ROW EXECUTE FUNCTION public.clinic_lab_report_versions_protect();


--
-- Name: clinic_lab_reports clinic_lab_reports_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_lab_reports_preserve_identity BEFORE UPDATE ON public.clinic_lab_reports FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'source_name', 'external_report_id', 'external_report_id_digest');


--
-- Name: clinic_lab_result_follow_ups clinic_lab_result_follow_ups_protect; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_lab_result_follow_ups_protect BEFORE DELETE OR UPDATE ON public.clinic_lab_result_follow_ups FOR EACH ROW EXECUTE FUNCTION public.clinic_lab_result_follow_ups_protect();


--
-- Name: clinic_medication_administration_movements clinic_medication_administration_movements_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_medication_administration_movements_immutable BEFORE DELETE OR UPDATE ON public.clinic_medication_administration_movements FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_medication_administrations clinic_medication_administrations_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_medication_administrations_immutable BEFORE DELETE OR UPDATE ON public.clinic_medication_administrations FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_medication_statements clinic_medication_statements_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_medication_statements_preserve_identity BEFORE UPDATE ON public.clinic_medication_statements FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id');


--
-- Name: clinic_memberships clinic_memberships_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_memberships_preserve_identity BEFORE UPDATE ON public.clinic_memberships FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'user_id');


--
-- Name: clinic_message_attachments clinic_message_attachments_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_message_attachments_immutable BEFORE DELETE OR UPDATE ON public.clinic_message_attachments FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_message_delivery_events clinic_message_delivery_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_message_delivery_events_immutable BEFORE DELETE OR UPDATE ON public.clinic_message_delivery_events FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_message_intents clinic_message_intents_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_message_intents_immutable BEFORE DELETE OR UPDATE ON public.clinic_message_intents FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_message_outbox clinic_message_outbox_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_message_outbox_preserve_identity BEFORE UPDATE ON public.clinic_message_outbox FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'message_intent_id');


--
-- Name: clinic_model_versions clinic_model_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_model_versions_immutable BEFORE DELETE OR UPDATE ON public.clinic_model_versions FOR EACH ROW EXECUTE FUNCTION public.clinic_model_versions_immutable();


--
-- Name: clinic_observation_sources clinic_observation_sources_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_observation_sources_immutable BEFORE DELETE OR UPDATE ON public.clinic_observation_sources FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_observations clinic_observations_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_observations_preserve_identity BEFORE UPDATE ON public.clinic_observations FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'encounter_id', 'author_membership_id', 'parent_observation_id', 'value_binding_id');


--
-- Name: clinic_operation_receipts clinic_operation_receipts_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_operation_receipts_immutable BEFORE DELETE OR UPDATE ON public.clinic_operation_receipts FOR EACH ROW EXECUTE FUNCTION public.clinic_operation_receipts_immutable();


--
-- Name: clinic_patient_address_versions clinic_patient_address_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_patient_address_versions_immutable BEFORE DELETE OR UPDATE ON public.clinic_patient_address_versions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_patient_care_needs clinic_patient_care_needs_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_patient_care_needs_preserve_identity BEFORE UPDATE ON public.clinic_patient_care_needs FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'recorded_by_membership_id', 'recorded_at', 'effective_from');


--
-- Name: clinic_patient_contacts clinic_patient_contacts_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_patient_contacts_immutable BEFORE DELETE OR UPDATE ON public.clinic_patient_contacts FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_patient_emergency_contacts clinic_patient_emergency_contacts_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_patient_emergency_contacts_immutable BEFORE DELETE OR UPDATE ON public.clinic_patient_emergency_contacts FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_patient_history_reviews clinic_patient_history_reviews_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_patient_history_reviews_immutable BEFORE DELETE OR UPDATE ON public.clinic_patient_history_reviews FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_patient_memberships clinic_patient_memberships_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_patient_memberships_immutable BEFORE DELETE OR UPDATE ON public.clinic_patient_memberships FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_patient_social_histories clinic_patient_social_histories_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_patient_social_histories_immutable BEFORE DELETE OR UPDATE ON public.clinic_patient_social_histories FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_patients clinic_patients_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_patients_preserve_identity BEFORE UPDATE ON public.clinic_patients FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id');


--
-- Name: clinic_payment_allocations clinic_payment_allocations_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_payment_allocations_immutable BEFORE DELETE OR UPDATE ON public.clinic_payment_allocations FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_payment_events clinic_payment_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_payment_events_immutable BEFORE DELETE OR UPDATE ON public.clinic_payment_events FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_previsit_notes clinic_previsit_notes_protect; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_previsit_notes_protect BEFORE DELETE OR UPDATE ON public.clinic_previsit_notes FOR EACH ROW EXECUTE FUNCTION public.clinic_previsit_notes_protect();


--
-- Name: clinic_refund_events clinic_refund_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_refund_events_immutable BEFORE DELETE OR UPDATE ON public.clinic_refund_events FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_role_grant_events clinic_role_grant_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_role_grant_events_immutable BEFORE DELETE OR UPDATE ON public.clinic_role_grant_events FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_role_grants clinic_role_grants_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_role_grants_preserve_identity BEFORE UPDATE ON public.clinic_role_grants FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'membership_id', 'role_version_id', 'scope_kind', 'site_id');


--
-- Name: clinic_rooms clinic_rooms_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_rooms_preserve_identity BEFORE UPDATE ON public.clinic_rooms FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'site_id');


--
-- Name: clinic_sites clinic_sites_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_sites_preserve_identity BEFORE UPDATE ON public.clinic_sites FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id');


--
-- Name: clinic_staff_address_versions clinic_staff_address_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_staff_address_versions_immutable BEFORE DELETE OR UPDATE ON public.clinic_staff_address_versions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_staff_members clinic_staff_members_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_staff_members_preserve_identity BEFORE UPDATE ON public.clinic_staff_members FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id');


--
-- Name: clinic_subscription_agreements clinic_subscription_agreements_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_subscription_agreements_immutable BEFORE DELETE OR UPDATE ON public.clinic_subscription_agreements FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_subscription_events clinic_subscription_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_subscription_events_immutable BEFORE DELETE OR UPDATE ON public.clinic_subscription_events FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_subscription_versions clinic_subscription_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_subscription_versions_immutable BEFORE DELETE OR UPDATE ON public.clinic_subscription_versions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_supplier_address_versions clinic_supplier_address_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_supplier_address_versions_immutable BEFORE DELETE OR UPDATE ON public.clinic_supplier_address_versions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_telehealth_wrap_ups clinic_telehealth_wrap_ups_protect_finalized; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_telehealth_wrap_ups_protect_finalized BEFORE DELETE OR UPDATE ON public.clinic_telehealth_wrap_ups FOR EACH ROW EXECUTE FUNCTION public.clinic_telehealth_wrap_ups_protect_finalized();


--
-- Name: clinic_visit_types clinic_visit_types_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_visit_types_preserve_identity BEFORE UPDATE ON public.clinic_visit_types FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id');


--
-- Name: clinic_workforce_settings_versions clinic_workforce_settings_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_workforce_settings_versions_immutable BEFORE DELETE OR UPDATE ON public.clinic_workforce_settings_versions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_inventory_control_reviews controlled_count_certification_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER controlled_count_certification_guard BEFORE INSERT ON public.clinic_inventory_control_reviews FOR EACH ROW EXECUTE FUNCTION public.inventory_control_certification_guard();


--
-- Name: clinic_inventory_count_approvals count_approval_separation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER count_approval_separation BEFORE INSERT ON public.clinic_inventory_count_approvals FOR EACH ROW EXECUTE FUNCTION public.inventory_count_approval_authority();


--
-- Name: clinic_inventory_entries count_correction_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER count_correction_authority BEFORE INSERT ON public.clinic_inventory_entries FOR EACH ROW EXECUTE FUNCTION public.inventory_count_correction_authority();


--
-- Name: clinic_inventory_counts count_session_event_required; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER count_session_event_required AFTER INSERT ON public.clinic_inventory_counts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_session_count_event_required();


--
-- Name: clinic_inventory_counts count_session_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER count_session_scope BEFORE INSERT ON public.clinic_inventory_counts FOR EACH ROW EXECUTE FUNCTION public.inventory_session_count_guard();


--
-- Name: role_version_permissions freeze_granted_role_permissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER freeze_granted_role_permissions BEFORE INSERT ON public.role_version_permissions FOR EACH ROW EXECUTE FUNCTION public.erd_freeze_granted_role();


--
-- Name: clinic_inventory_catalog_events immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_catalog_events FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_count_approvals immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_count_approvals FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_counts immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_counts FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_entries immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_entries FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_hold_releases immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_hold_releases FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_holds immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_holds FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_lots immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_lots FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_profiles immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_profiles FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_receipt_lines immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_receipt_lines FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_receipts immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_receipts FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_receiving_sessions immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_receiving_sessions FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_shipment_lines immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_shipment_lines FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_shipment_reconciliations immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_shipment_reconciliations FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_shipments immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_shipments FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_supplier_credits immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_supplier_credits FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_supplier_invoices immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_vendor_returns immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_inventory_vendor_returns FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_notes immutable_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_history BEFORE DELETE OR UPDATE ON public.clinic_notes FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_pharmacy_batches inventory_batch_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_batch_balance BEFORE UPDATE ON public.clinic_pharmacy_batches FOR EACH ROW EXECUTE FUNCTION public.inventory_balance_guard();


--
-- Name: clinic_pharmacy_products inventory_catalog_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_catalog_change BEFORE UPDATE ON public.clinic_pharmacy_products FOR EACH ROW EXECUTE FUNCTION public.inventory_catalog_guard();


--
-- Name: clinic_inventory_entries inventory_context; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_context BEFORE INSERT ON public.clinic_inventory_entries FOR EACH ROW EXECUTE FUNCTION public.inventory_posting_context();


--
-- Name: clinic_inventory_entries inventory_count_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_count_complete AFTER INSERT ON public.clinic_inventory_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_complete();


--
-- Name: clinic_inventory_count_sessions inventory_count_session_delete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_count_session_delete_guard BEFORE DELETE ON public.clinic_inventory_count_sessions FOR EACH ROW EXECUTE FUNCTION public.inventory_count_session_delete_guard();


--
-- Name: clinic_inventory_count_session_events inventory_count_session_event_applied; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_count_session_event_applied AFTER INSERT ON public.clinic_inventory_count_session_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_count_session_event_applied();


--
-- Name: clinic_inventory_count_session_events inventory_count_session_event_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_count_session_event_guard BEFORE INSERT ON public.clinic_inventory_count_session_events FOR EACH ROW EXECUTE FUNCTION public.inventory_count_session_event_guard();


--
-- Name: clinic_inventory_count_session_events inventory_count_session_event_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_count_session_event_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_count_session_events FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_count_sessions inventory_count_session_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_count_session_guard BEFORE INSERT OR UPDATE ON public.clinic_inventory_count_sessions FOR EACH ROW EXECUTE FUNCTION public.inventory_count_session_guard();


--
-- Name: clinic_inventory_count_session_lines inventory_count_session_line_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_count_session_line_guard BEFORE INSERT ON public.clinic_inventory_count_session_lines FOR EACH ROW EXECUTE FUNCTION public.inventory_count_session_line_guard();


--
-- Name: clinic_inventory_count_session_lines inventory_count_session_line_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_count_session_line_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_count_session_lines FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_count_sessions inventory_count_session_scope_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_count_session_scope_complete AFTER INSERT ON public.clinic_inventory_count_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_count_session_scope_complete();


--
-- Name: clinic_inventory_catalog_events inventory_evidence_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_authority BEFORE INSERT ON public.clinic_inventory_catalog_events FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_context();


--
-- Name: clinic_inventory_count_approvals inventory_evidence_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_authority BEFORE INSERT ON public.clinic_inventory_count_approvals FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_context();


--
-- Name: clinic_inventory_counts inventory_evidence_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_authority BEFORE INSERT ON public.clinic_inventory_counts FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_context();


--
-- Name: clinic_inventory_hold_releases inventory_evidence_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_authority BEFORE INSERT ON public.clinic_inventory_hold_releases FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_context();


--
-- Name: clinic_inventory_holds inventory_evidence_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_authority BEFORE INSERT ON public.clinic_inventory_holds FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_context();


--
-- Name: clinic_inventory_profiles inventory_evidence_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_authority BEFORE INSERT ON public.clinic_inventory_profiles FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_context();


--
-- Name: clinic_inventory_receipts inventory_evidence_authority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_authority BEFORE INSERT ON public.clinic_inventory_receipts FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_context();


--
-- Name: clinic_inventory_entries inventory_evidence_link_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_link_guard BEFORE INSERT OR UPDATE ON public.clinic_inventory_entries FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_link_guard();


--
-- Name: clinic_inventory_holds inventory_evidence_link_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_evidence_link_guard BEFORE INSERT OR UPDATE ON public.clinic_inventory_holds FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_link_guard();


--
-- Name: clinic_inventory_exception_reviews inventory_exception_review_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_exception_review_guard BEFORE INSERT ON public.clinic_inventory_exception_reviews FOR EACH ROW EXECUTE FUNCTION public.inventory_exception_review_guard();


--
-- Name: clinic_inventory_exception_reviews inventory_exception_review_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_exception_review_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_exception_reviews FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_receipt_lines inventory_line_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_line_complete AFTER INSERT ON public.clinic_inventory_receipt_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_complete();


--
-- Name: clinic_inventory_locations inventory_location_delete_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_location_delete_guard BEFORE DELETE ON public.clinic_inventory_locations FOR EACH ROW EXECUTE FUNCTION public.inventory_location_delete_guard();


--
-- Name: clinic_inventory_locations inventory_location_hierarchy_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_location_hierarchy_guard BEFORE INSERT OR UPDATE ON public.clinic_inventory_locations FOR EACH ROW EXECUTE FUNCTION public.inventory_location_hierarchy_guard();


--
-- Name: clinic_pharmacy_batches inventory_location_stock_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_location_stock_guard BEFORE INSERT OR UPDATE OF on_hand, location_id ON public.clinic_pharmacy_batches FOR EACH ROW EXECUTE FUNCTION public.inventory_location_stock_guard();


--
-- Name: clinic_pharmacy_batches inventory_new_batch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_new_batch BEFORE INSERT ON public.clinic_pharmacy_batches FOR EACH ROW EXECUTE FUNCTION public.inventory_new_position();


--
-- Name: clinic_items inventory_new_office; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_new_office BEFORE INSERT ON public.clinic_items FOR EACH ROW EXECUTE FUNCTION public.inventory_new_position();


--
-- Name: clinic_items inventory_office_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_office_balance BEFORE UPDATE ON public.clinic_items FOR EACH ROW EXECUTE FUNCTION public.inventory_balance_guard();


--
-- Name: clinic_inventory_entries inventory_post; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_post BEFORE INSERT ON public.clinic_inventory_entries FOR EACH ROW EXECUTE FUNCTION public.inventory_entry_post();


--
-- Name: clinic_pharmacy_batches inventory_recall_batch_contained; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_recall_batch_contained AFTER INSERT OR UPDATE ON public.clinic_pharmacy_batches DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_recall_containment_complete();


--
-- Name: clinic_inventory_recall_closures inventory_recall_closure_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_recall_closure_guard BEFORE INSERT ON public.clinic_inventory_recall_closures FOR EACH ROW EXECUTE FUNCTION public.inventory_recall_closure_guard();


--
-- Name: clinic_inventory_recall_closures inventory_recall_closure_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_recall_closure_immutable BEFORE DELETE OR UPDATE ON public.clinic_inventory_recall_closures FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_inventory_holds inventory_recall_hold_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_recall_hold_guard BEFORE INSERT ON public.clinic_inventory_holds FOR EACH ROW EXECUTE FUNCTION public.inventory_recall_hold_guard();


--
-- Name: clinic_inventory_recall_lots inventory_recall_lot_contained; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_recall_lot_contained AFTER INSERT ON public.clinic_inventory_recall_lots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_recall_containment_complete();


--
-- Name: clinic_inventory_recall_lots inventory_recall_lot_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_recall_lot_guard BEFORE INSERT ON public.clinic_inventory_recall_lots FOR EACH ROW EXECUTE FUNCTION public.inventory_recall_lot_guard();


--
-- Name: clinic_inventory_hold_releases inventory_recall_release_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_recall_release_guard BEFORE INSERT ON public.clinic_inventory_hold_releases FOR EACH ROW EXECUTE FUNCTION public.inventory_recall_release_guard();


--
-- Name: clinic_inventory_recalls inventory_recall_status_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_recall_status_guard BEFORE INSERT OR UPDATE ON public.clinic_inventory_recalls FOR EACH ROW EXECUTE FUNCTION public.inventory_recall_status_guard();


--
-- Name: clinic_inventory_receipts inventory_receipt_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_receipt_complete AFTER INSERT ON public.clinic_inventory_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_complete();


--
-- Name: clinic_inventory_receipts inventory_receipt_open_shipment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_receipt_open_shipment BEFORE INSERT ON public.clinic_inventory_receipts FOR EACH ROW EXECUTE FUNCTION public.inventory_receipt_open_shipment();


--
-- Name: clinic_inventory_receipt_lines inventory_receipt_units; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_receipt_units BEFORE INSERT ON public.clinic_inventory_receipt_lines FOR EACH ROW EXECUTE FUNCTION public.inventory_receipt_check();


--
-- Name: clinic_inventory_shipment_reconciliations inventory_reconciliation_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_reconciliation_complete AFTER INSERT ON public.clinic_inventory_shipment_reconciliations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_reconciliation_complete();


--
-- Name: clinic_inventory_shipment_reconciliations inventory_reconciliation_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_reconciliation_guard BEFORE INSERT ON public.clinic_inventory_shipment_reconciliations FOR EACH ROW EXECUTE FUNCTION public.inventory_reconciliation_guard();


--
-- Name: clinic_invoice_stripe_checkouts invoice_stripe_checkout_routing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER invoice_stripe_checkout_routing BEFORE DELETE OR UPDATE ON public.clinic_invoice_stripe_checkouts FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_stripe_checkout_routing();


--
-- Name: clinic_pharmacy_movements legacy_inventory_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER legacy_inventory_frozen BEFORE INSERT OR DELETE OR UPDATE ON public.clinic_pharmacy_movements FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_stock_movements legacy_inventory_frozen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER legacy_inventory_frozen BEFORE INSERT OR DELETE OR UPDATE ON public.clinic_stock_movements FOR EACH ROW EXECUTE FUNCTION public.inventory_immutable();


--
-- Name: clinic_role_grants lock_granted_role; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lock_granted_role BEFORE INSERT ON public.clinic_role_grants FOR EACH ROW EXECUTE FUNCTION public.erd_freeze_granted_role();


--
-- Name: permissions permissions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER permissions_immutable BEFORE DELETE OR UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_pharmacy_batch_events pharmacy_event_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pharmacy_event_guard BEFORE DELETE OR UPDATE ON public.clinic_pharmacy_batch_events FOR EACH ROW EXECUTE FUNCTION public.legacy_pharmacy_guard();


--
-- Name: platform_audit_events platform_audit_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER platform_audit_events_immutable BEFORE DELETE OR UPDATE ON public.platform_audit_events FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: role_version_permissions role_version_permissions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER role_version_permissions_immutable BEFORE DELETE OR UPDATE ON public.role_version_permissions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: role_versions role_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER role_versions_immutable BEFORE DELETE OR UPDATE ON public.role_versions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_stripe_checkouts stripe_checkout_routing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stripe_checkout_routing BEFORE DELETE OR UPDATE ON public.clinic_stripe_checkouts FOR EACH ROW EXECUTE FUNCTION public.guard_stripe_routing();


--
-- Name: clinic_stripe_connections stripe_connection_routing; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stripe_connection_routing BEFORE DELETE OR UPDATE ON public.clinic_stripe_connections FOR EACH ROW EXECUTE FUNCTION public.guard_stripe_routing();


--
-- Name: clinic_stripe_membership_cycles stripe_cycles_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stripe_cycles_immutable BEFORE DELETE OR UPDATE ON public.clinic_stripe_membership_cycles FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_telehealth_checkins telehealth_checkins_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER telehealth_checkins_immutable BEFORE DELETE OR UPDATE ON public.clinic_telehealth_checkins FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_telehealth_consents telehealth_consents_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER telehealth_consents_immutable BEFORE DELETE OR UPDATE ON public.clinic_telehealth_consents FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_telehealth_join_grants telehealth_join_grants_freeze; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER telehealth_join_grants_freeze BEFORE DELETE OR UPDATE ON public.clinic_telehealth_join_grants FOR EACH ROW EXECUTE FUNCTION public.telehealth_join_grant_freeze();


--
-- Name: clinic_telehealth_patient_receipts telehealth_patient_receipts_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER telehealth_patient_receipts_immutable BEFORE DELETE OR UPDATE ON public.clinic_telehealth_patient_receipts FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_telehealth_policy_versions telehealth_policy_versions_freeze; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER telehealth_policy_versions_freeze BEFORE DELETE OR UPDATE ON public.clinic_telehealth_policy_versions FOR EACH ROW EXECUTE FUNCTION public.telehealth_policy_freeze();


--
-- Name: clinic_telehealth_provider_events telehealth_provider_events_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER telehealth_provider_events_immutable BEFORE DELETE OR UPDATE ON public.clinic_telehealth_provider_events FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_workforce_adjustment_requests workforce_adjustment_freeze; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_adjustment_freeze BEFORE DELETE OR UPDATE ON public.clinic_workforce_adjustment_requests FOR EACH ROW EXECUTE FUNCTION public.workforce_adjustment_freeze();


--
-- Name: clinic_workforce_export_batches workforce_export_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_export_immutable BEFORE DELETE OR UPDATE ON public.clinic_workforce_export_batches FOR EACH ROW EXECUTE FUNCTION public.workforce_payroll_immutable();


--
-- Name: clinic_workforce_payroll_configuration_versions workforce_payroll_config_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_payroll_config_immutable BEFORE DELETE OR UPDATE ON public.clinic_workforce_payroll_configuration_versions FOR EACH ROW EXECUTE FUNCTION public.workforce_payroll_immutable();


--
-- Name: clinic_workforce_punches workforce_punches_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_punches_immutable BEFORE DELETE OR UPDATE ON public.clinic_workforce_punches FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_workforce_schedule_publications workforce_schedule_publications_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_schedule_publications_immutable BEFORE DELETE OR UPDATE ON public.clinic_workforce_schedule_publications FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_workforce_time_segments workforce_segments_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_segments_immutable BEFORE DELETE OR UPDATE ON public.clinic_workforce_time_segments FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_workforce_timecard_versions workforce_timecard_freeze; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_timecard_freeze BEFORE DELETE OR UPDATE ON public.clinic_workforce_timecard_versions FOR EACH ROW EXECUTE FUNCTION public.workforce_timecard_freeze();


--
-- Name: clinic_appointments fk_appointments_clinician; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT fk_appointments_clinician FOREIGN KEY (practice_id, booked_clinician_id) REFERENCES public.clinic_clinician_profiles(practice_id, id);


--
-- Name: clinic_appointments fk_appointments_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT fk_appointments_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_appointments fk_appointments_room; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT fk_appointments_room FOREIGN KEY (practice_id, site_id, room_id) REFERENCES public.clinic_rooms(practice_id, site_id, id);


--
-- Name: clinic_appointments fk_appointments_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT fk_appointments_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_appointments fk_appointments_visit_type; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT fk_appointments_visit_type FOREIGN KEY (practice_id, visit_type_id) REFERENCES public.clinic_visit_types(practice_id, id);


--
-- Name: clinic_clinician_assignments fk_assignments_department; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_assignments
    ADD CONSTRAINT fk_assignments_department FOREIGN KEY (practice_id, department_id) REFERENCES public.clinic_departments(practice_id, id);


--
-- Name: clinic_clinician_assignments fk_assignments_profile; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_assignments
    ADD CONSTRAINT fk_assignments_profile FOREIGN KEY (practice_id, clinician_profile_id) REFERENCES public.clinic_clinician_profiles(practice_id, id);


--
-- Name: clinic_clinician_assignments fk_assignments_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_assignments
    ADD CONSTRAINT fk_assignments_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_audit_resource_manifests fk_audit_manifests_event; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_resource_manifests
    ADD CONSTRAINT fk_audit_manifests_event FOREIGN KEY (practice_id, audit_event_id) REFERENCES public.clinic_audit_events(practice_id, id);


--
-- Name: clinic_audit_delivery_receipts fk_audit_receipts_event; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_delivery_receipts
    ADD CONSTRAINT fk_audit_receipts_event FOREIGN KEY (practice_id, audit_event_id) REFERENCES public.clinic_audit_events(practice_id, id);


--
-- Name: clinic_billing_receipts fk_billing_receipts_invoice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_receipts
    ADD CONSTRAINT fk_billing_receipts_invoice FOREIGN KEY (practice_id, patient_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, patient_id, id);


--
-- Name: clinic_billing_receipts fk_billing_receipts_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_receipts
    ADD CONSTRAINT fk_billing_receipts_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_billing_receipts fk_billing_receipts_payment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_receipts
    ADD CONSTRAINT fk_billing_receipts_payment FOREIGN KEY (practice_id, patient_id, payment_event_id) REFERENCES public.clinic_payment_events(practice_id, patient_id, id);


--
-- Name: clinic_patient_care_needs fk_care_needs_recorder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_care_needs
    ADD CONSTRAINT fk_care_needs_recorder FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_patient_care_needs fk_care_needs_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_care_needs
    ADD CONSTRAINT fk_care_needs_reviewer FOREIGN KEY (practice_id, reviewed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_cash_tenders fk_cash_tenders_drawer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders
    ADD CONSTRAINT fk_cash_tenders_drawer FOREIGN KEY (practice_id, cash_drawer_session_id) REFERENCES public.clinic_cash_drawer_sessions(practice_id, id);


--
-- Name: clinic_cash_tenders fk_cash_tenders_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders
    ADD CONSTRAINT fk_cash_tenders_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_cash_tenders fk_cash_tenders_payment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders
    ADD CONSTRAINT fk_cash_tenders_payment FOREIGN KEY (practice_id, patient_id, payment_event_id) REFERENCES public.clinic_payment_events(practice_id, patient_id, id);


--
-- Name: clinic_allergies fk_clinic_allergies_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_allergies
    ADD CONSTRAINT fk_clinic_allergies_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_allergies fk_clinic_allergies_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_allergies
    ADD CONSTRAINT fk_clinic_allergies_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_allergies fk_clinic_allergies_recorder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_allergies
    ADD CONSTRAINT fk_clinic_allergies_recorder FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_allergies fk_clinic_allergies_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_allergies
    ADD CONSTRAINT fk_clinic_allergies_reviewer FOREIGN KEY (practice_id, reviewed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_appointments fk_clinic_appointments_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_appointments
    ADD CONSTRAINT fk_clinic_appointments_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_audit_delivery_receipts fk_clinic_audit_delivery_receipts_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_delivery_receipts
    ADD CONSTRAINT fk_clinic_audit_delivery_receipts_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_audit_events fk_clinic_audit_events_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_events
    ADD CONSTRAINT fk_clinic_audit_events_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_audit_resource_manifests fk_clinic_audit_resource_manifests_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_audit_resource_manifests
    ADD CONSTRAINT fk_clinic_audit_resource_manifests_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_clinician_assignments fk_clinic_clinician_assignments_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_assignments
    ADD CONSTRAINT fk_clinic_clinician_assignments_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_clinician_credentials fk_clinic_clinician_credentials_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_credentials
    ADD CONSTRAINT fk_clinic_clinician_credentials_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_clinician_profiles fk_clinic_clinician_profiles_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_profiles
    ADD CONSTRAINT fk_clinic_clinician_profiles_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_conditions fk_clinic_conditions_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_conditions
    ADD CONSTRAINT fk_clinic_conditions_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_conditions fk_clinic_conditions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_conditions
    ADD CONSTRAINT fk_clinic_conditions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_conditions fk_clinic_conditions_recorder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_conditions
    ADD CONSTRAINT fk_clinic_conditions_recorder FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_conditions fk_clinic_conditions_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_conditions
    ADD CONSTRAINT fk_clinic_conditions_reviewer FOREIGN KEY (practice_id, reviewed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_coverage_versions fk_clinic_coverage_versions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_coverage_versions
    ADD CONSTRAINT fk_clinic_coverage_versions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_credit_notes fk_clinic_credit_notes_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_credit_notes
    ADD CONSTRAINT fk_clinic_credit_notes_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_departments fk_clinic_departments_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_departments
    ADD CONSTRAINT fk_clinic_departments_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_document_categories fk_clinic_document_categories_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_document_categories
    ADD CONSTRAINT fk_clinic_document_categories_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_documents fk_clinic_documents_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_documents
    ADD CONSTRAINT fk_clinic_documents_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_encounter_note_revisions fk_clinic_encounter_note_revisions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_revisions
    ADD CONSTRAINT fk_clinic_encounter_note_revisions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_encounter_note_signatures fk_clinic_encounter_note_signatures_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_signatures
    ADD CONSTRAINT fk_clinic_encounter_note_signatures_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_encounter_notes fk_clinic_encounter_notes_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_notes
    ADD CONSTRAINT fk_clinic_encounter_notes_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_encounter_participants fk_clinic_encounter_participants_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_participants
    ADD CONSTRAINT fk_clinic_encounter_participants_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_encounter_precautions fk_clinic_encounter_precautions_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_precautions
    ADD CONSTRAINT fk_clinic_encounter_precautions_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_encounter_precautions fk_clinic_encounter_precautions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_precautions
    ADD CONSTRAINT fk_clinic_encounter_precautions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_encounters fk_clinic_encounters_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounters
    ADD CONSTRAINT fk_clinic_encounters_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_insurance_claims fk_clinic_insurance_claims_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_insurance_claims
    ADD CONSTRAINT fk_clinic_insurance_claims_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_invoice_lines fk_clinic_invoice_lines_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_lines
    ADD CONSTRAINT fk_clinic_invoice_lines_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_invoices fk_clinic_invoices_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoices
    ADD CONSTRAINT fk_clinic_invoices_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_medication_statements fk_clinic_medication_statements_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_statements
    ADD CONSTRAINT fk_clinic_medication_statements_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_medication_statements fk_clinic_medication_statements_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_statements
    ADD CONSTRAINT fk_clinic_medication_statements_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_medication_statements fk_clinic_medication_statements_recorder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_statements
    ADD CONSTRAINT fk_clinic_medication_statements_recorder FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_medication_statements fk_clinic_medication_statements_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_statements
    ADD CONSTRAINT fk_clinic_medication_statements_reviewer FOREIGN KEY (practice_id, reviewed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_message_attachments fk_clinic_message_attachments_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_attachments
    ADD CONSTRAINT fk_clinic_message_attachments_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_message_delivery_events fk_clinic_message_delivery_events_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_delivery_events
    ADD CONSTRAINT fk_clinic_message_delivery_events_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_message_intents fk_clinic_message_intents_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_intents
    ADD CONSTRAINT fk_clinic_message_intents_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_message_outbox fk_clinic_message_outbox_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_outbox
    ADD CONSTRAINT fk_clinic_message_outbox_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_model_versions fk_clinic_model_versions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_model_versions
    ADD CONSTRAINT fk_clinic_model_versions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_observation_sources fk_clinic_observation_sources_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observation_sources
    ADD CONSTRAINT fk_clinic_observation_sources_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_observations fk_clinic_observations_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observations
    ADD CONSTRAINT fk_clinic_observations_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_observations fk_clinic_observations_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observations
    ADD CONSTRAINT fk_clinic_observations_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_address_versions fk_clinic_patient_address_versions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_address_versions
    ADD CONSTRAINT fk_clinic_patient_address_versions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_care_needs fk_clinic_patient_care_needs_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_care_needs
    ADD CONSTRAINT fk_clinic_patient_care_needs_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_care_needs fk_clinic_patient_care_needs_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_care_needs
    ADD CONSTRAINT fk_clinic_patient_care_needs_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_communication_preferences fk_clinic_patient_communication_preferences_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_communication_preferences
    ADD CONSTRAINT fk_clinic_patient_communication_preferences_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_communication_preferences fk_clinic_patient_communication_preferences_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_communication_preferences
    ADD CONSTRAINT fk_clinic_patient_communication_preferences_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_contacts fk_clinic_patient_contacts_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_contacts
    ADD CONSTRAINT fk_clinic_patient_contacts_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_contacts fk_clinic_patient_contacts_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_contacts
    ADD CONSTRAINT fk_clinic_patient_contacts_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_demographics fk_clinic_patient_demographics_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_demographics
    ADD CONSTRAINT fk_clinic_patient_demographics_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_demographics fk_clinic_patient_demographics_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_demographics
    ADD CONSTRAINT fk_clinic_patient_demographics_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_emergency_contacts fk_clinic_patient_emergency_contacts_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_emergency_contacts
    ADD CONSTRAINT fk_clinic_patient_emergency_contacts_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_emergency_contacts fk_clinic_patient_emergency_contacts_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_emergency_contacts
    ADD CONSTRAINT fk_clinic_patient_emergency_contacts_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_history_reviews fk_clinic_patient_history_reviews_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_history_reviews
    ADD CONSTRAINT fk_clinic_patient_history_reviews_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_history_reviews fk_clinic_patient_history_reviews_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_history_reviews
    ADD CONSTRAINT fk_clinic_patient_history_reviews_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_memberships fk_clinic_patient_memberships_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_memberships
    ADD CONSTRAINT fk_clinic_patient_memberships_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_social_histories fk_clinic_patient_social_histories_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_social_histories
    ADD CONSTRAINT fk_clinic_patient_social_histories_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_social_histories fk_clinic_patient_social_histories_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_social_histories
    ADD CONSTRAINT fk_clinic_patient_social_histories_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_payment_allocations fk_clinic_payment_allocations_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_allocations
    ADD CONSTRAINT fk_clinic_payment_allocations_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_payment_events fk_clinic_payment_events_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_events
    ADD CONSTRAINT fk_clinic_payment_events_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_refund_events fk_clinic_refund_events_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_refund_events
    ADD CONSTRAINT fk_clinic_refund_events_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_role_grant_events fk_clinic_role_grant_events_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grant_events
    ADD CONSTRAINT fk_clinic_role_grant_events_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_role_grants fk_clinic_role_grants_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grants
    ADD CONSTRAINT fk_clinic_role_grants_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_rooms fk_clinic_rooms_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_rooms
    ADD CONSTRAINT fk_clinic_rooms_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_site_hour_exceptions fk_clinic_site_exceptions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_site_hour_exceptions
    ADD CONSTRAINT fk_clinic_site_exceptions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_site_hour_exceptions fk_clinic_site_exceptions_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_site_hour_exceptions
    ADD CONSTRAINT fk_clinic_site_exceptions_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_site_operating_hours fk_clinic_site_hours_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_site_operating_hours
    ADD CONSTRAINT fk_clinic_site_hours_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_site_operating_hours fk_clinic_site_hours_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_site_operating_hours
    ADD CONSTRAINT fk_clinic_site_hours_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_sites fk_clinic_sites_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_sites
    ADD CONSTRAINT fk_clinic_sites_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_address_versions fk_clinic_staff_address_versions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_address_versions
    ADD CONSTRAINT fk_clinic_staff_address_versions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_supplier_address_versions fk_clinic_supplier_address_versions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_supplier_address_versions
    ADD CONSTRAINT fk_clinic_supplier_address_versions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_visit_types fk_clinic_visit_types_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_visit_types
    ADD CONSTRAINT fk_clinic_visit_types_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_communication_endpoints fk_communication_endpoints_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_communication_endpoints
    ADD CONSTRAINT fk_communication_endpoints_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_communication_preferences fk_communication_preferences_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_communication_preferences
    ADD CONSTRAINT fk_communication_preferences_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_coverage_versions fk_coverage_versions_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_coverage_versions
    ADD CONSTRAINT fk_coverage_versions_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_clinician_credentials fk_credentials_profile; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_credentials
    ADD CONSTRAINT fk_credentials_profile FOREIGN KEY (practice_id, clinician_profile_id) REFERENCES public.clinic_clinician_profiles(practice_id, id);


--
-- Name: clinic_credit_notes fk_credit_notes_invoice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_credit_notes
    ADD CONSTRAINT fk_credit_notes_invoice FOREIGN KEY (practice_id, patient_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, patient_id, id);


--
-- Name: clinic_credit_notes fk_credit_notes_issuer_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_credit_notes
    ADD CONSTRAINT fk_credit_notes_issuer_membership FOREIGN KEY (practice_id, issued_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_credit_notes fk_credit_notes_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_credit_notes
    ADD CONSTRAINT fk_credit_notes_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_documents fk_documents_category; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_documents
    ADD CONSTRAINT fk_documents_category FOREIGN KEY (practice_id, category_id) REFERENCES public.clinic_document_categories(practice_id, id);


--
-- Name: clinic_documents fk_documents_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_documents
    ADD CONSTRAINT fk_documents_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_documents fk_documents_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_documents
    ADD CONSTRAINT fk_documents_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_encounter_follow_ups fk_encounter_follow_ups_appointment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT fk_encounter_follow_ups_appointment FOREIGN KEY (practice_id, patient_id, follow_up_appointment_id) REFERENCES public.clinic_appointments(practice_id, patient_id, id);


--
-- Name: clinic_encounter_follow_ups fk_encounter_follow_ups_assigned_to; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT fk_encounter_follow_ups_assigned_to FOREIGN KEY (practice_id, assigned_to_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_encounter_follow_ups fk_encounter_follow_ups_completed_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT fk_encounter_follow_ups_completed_by FOREIGN KEY (practice_id, completed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_encounter_follow_ups fk_encounter_follow_ups_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT fk_encounter_follow_ups_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_encounter_follow_ups fk_encounter_follow_ups_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT fk_encounter_follow_ups_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_encounter_follow_ups fk_encounter_follow_ups_recorded_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT fk_encounter_follow_ups_recorded_by FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_encounter_follow_ups fk_encounter_follow_ups_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT fk_encounter_follow_ups_updated_by FOREIGN KEY (practice_id, updated_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_encounter_notes fk_encounter_notes_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_notes
    ADD CONSTRAINT fk_encounter_notes_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_encounter_notes fk_encounter_notes_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_notes
    ADD CONSTRAINT fk_encounter_notes_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_encounter_precautions fk_encounter_precautions_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_precautions
    ADD CONSTRAINT fk_encounter_precautions_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_encounters fk_encounters_appointment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounters
    ADD CONSTRAINT fk_encounters_appointment FOREIGN KEY (practice_id, patient_id, appointment_id) REFERENCES public.clinic_appointments(practice_id, patient_id, id);


--
-- Name: clinic_encounters fk_encounters_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounters
    ADD CONSTRAINT fk_encounters_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_encounters fk_encounters_room; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounters
    ADD CONSTRAINT fk_encounters_room FOREIGN KEY (practice_id, site_id, room_id) REFERENCES public.clinic_rooms(practice_id, site_id, id);


--
-- Name: clinic_encounters fk_encounters_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounters
    ADD CONSTRAINT fk_encounters_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_patient_history_reviews fk_history_reviews_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_history_reviews
    ADD CONSTRAINT fk_history_reviews_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_patient_history_reviews fk_history_reviews_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_history_reviews
    ADD CONSTRAINT fk_history_reviews_reviewer FOREIGN KEY (practice_id, reviewer_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_insurance_claims fk_insurance_claims_coverage; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_insurance_claims
    ADD CONSTRAINT fk_insurance_claims_coverage FOREIGN KEY (practice_id, patient_id, coverage_version_id) REFERENCES public.clinic_coverage_versions(practice_id, patient_id, id);


--
-- Name: clinic_insurance_claims fk_insurance_claims_invoice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_insurance_claims
    ADD CONSTRAINT fk_insurance_claims_invoice FOREIGN KEY (practice_id, patient_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, patient_id, id);


--
-- Name: clinic_insurance_claims fk_insurance_claims_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_insurance_claims
    ADD CONSTRAINT fk_insurance_claims_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_inventory_count_session_events fk_inventory_count_session_events_actor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_events
    ADD CONSTRAINT fk_inventory_count_session_events_actor FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_count_session_events fk_inventory_count_session_events_assignee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_events
    ADD CONSTRAINT fk_inventory_count_session_events_assignee FOREIGN KEY (practice_id, assignee_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_count_session_events fk_inventory_count_session_events_count; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_events
    ADD CONSTRAINT fk_inventory_count_session_events_count FOREIGN KEY (practice_id, count_id) REFERENCES public.clinic_inventory_counts(practice_id, id);


--
-- Name: clinic_inventory_count_session_events fk_inventory_count_session_events_line; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_events
    ADD CONSTRAINT fk_inventory_count_session_events_line FOREIGN KEY (practice_id, count_session_line_id) REFERENCES public.clinic_inventory_count_session_lines(practice_id, id);


--
-- Name: clinic_inventory_count_session_events fk_inventory_count_session_events_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_events
    ADD CONSTRAINT fk_inventory_count_session_events_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_count_session_events fk_inventory_count_session_events_session; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_events
    ADD CONSTRAINT fk_inventory_count_session_events_session FOREIGN KEY (practice_id, count_session_id) REFERENCES public.clinic_inventory_count_sessions(practice_id, id);


--
-- Name: clinic_inventory_count_session_lines fk_inventory_count_session_lines_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_lines
    ADD CONSTRAINT fk_inventory_count_session_lines_batch FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_inventory_count_session_lines fk_inventory_count_session_lines_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_lines
    ADD CONSTRAINT fk_inventory_count_session_lines_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_count_session_lines fk_inventory_count_session_lines_session; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_session_lines
    ADD CONSTRAINT fk_inventory_count_session_lines_session FOREIGN KEY (practice_id, count_session_id) REFERENCES public.clinic_inventory_count_sessions(practice_id, id);


--
-- Name: clinic_inventory_count_sessions fk_inventory_count_sessions_actor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_sessions
    ADD CONSTRAINT fk_inventory_count_sessions_actor FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_count_sessions fk_inventory_count_sessions_assignee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_sessions
    ADD CONSTRAINT fk_inventory_count_sessions_assignee FOREIGN KEY (practice_id, assignee_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_count_sessions fk_inventory_count_sessions_location; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_sessions
    ADD CONSTRAINT fk_inventory_count_sessions_location FOREIGN KEY (practice_id, location_id) REFERENCES public.clinic_inventory_locations(practice_id, id);


--
-- Name: clinic_inventory_count_sessions fk_inventory_count_sessions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_sessions
    ADD CONSTRAINT fk_inventory_count_sessions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_counts fk_inventory_counts_session_line; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT fk_inventory_counts_session_line FOREIGN KEY (practice_id, count_session_line_id) REFERENCES public.clinic_inventory_count_session_lines(practice_id, id);


--
-- Name: clinic_inventory_exception_reviews fk_inventory_exception_reviews_actor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_exception_reviews
    ADD CONSTRAINT fk_inventory_exception_reviews_actor FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_exception_reviews fk_inventory_exception_reviews_assignee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_exception_reviews
    ADD CONSTRAINT fk_inventory_exception_reviews_assignee FOREIGN KEY (practice_id, assignee_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_exception_reviews fk_inventory_exception_reviews_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_exception_reviews
    ADD CONSTRAINT fk_inventory_exception_reviews_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_exception_reviews fk_inventory_exception_reviews_profile; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_exception_reviews
    ADD CONSTRAINT fk_inventory_exception_reviews_profile FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_inventory_locations fk_inventory_locations_parent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_locations
    ADD CONSTRAINT fk_inventory_locations_parent FOREIGN KEY (practice_id, parent_location_id) REFERENCES public.clinic_inventory_locations(practice_id, id);


--
-- Name: clinic_inventory_locations fk_inventory_locations_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_locations
    ADD CONSTRAINT fk_inventory_locations_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_inventory_purchase_orders fk_inventory_purchase_orders_receiving_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_orders
    ADD CONSTRAINT fk_inventory_purchase_orders_receiving_site FOREIGN KEY (practice_id, receiving_site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_inventory_recall_closures fk_inventory_recall_closures_actor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_closures
    ADD CONSTRAINT fk_inventory_recall_closures_actor FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_recall_closures fk_inventory_recall_closures_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_closures
    ADD CONSTRAINT fk_inventory_recall_closures_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_recall_closures fk_inventory_recall_closures_profile; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_closures
    ADD CONSTRAINT fk_inventory_recall_closures_profile FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_inventory_recall_closures fk_inventory_recall_closures_recall; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_closures
    ADD CONSTRAINT fk_inventory_recall_closures_recall FOREIGN KEY (practice_id, recall_id) REFERENCES public.clinic_inventory_recalls(practice_id, id);


--
-- Name: clinic_invoice_lines fk_invoice_lines_billing_service; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_lines
    ADD CONSTRAINT fk_invoice_lines_billing_service FOREIGN KEY (practice_id, billing_service_id) REFERENCES public.clinic_billing_services(practice_id, id);


--
-- Name: clinic_invoice_lines fk_invoice_lines_invoice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_lines
    ADD CONSTRAINT fk_invoice_lines_invoice FOREIGN KEY (practice_id, patient_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, patient_id, id);


--
-- Name: clinic_invoice_lines fk_invoice_lines_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_lines
    ADD CONSTRAINT fk_invoice_lines_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_invoices fk_invoices_checkout_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoices
    ADD CONSTRAINT fk_invoices_checkout_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_invoices fk_invoices_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoices
    ADD CONSTRAINT fk_invoices_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_invoices fk_invoices_voider_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoices
    ADD CONSTRAINT fk_invoices_voider_membership FOREIGN KEY (practice_id, voided_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_lab_result_follow_ups fk_lab_follow_ups_completer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_result_follow_ups
    ADD CONSTRAINT fk_lab_follow_ups_completer FOREIGN KEY (practice_id, completed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_lab_result_follow_ups fk_lab_follow_ups_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_result_follow_ups
    ADD CONSTRAINT fk_lab_follow_ups_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_lab_result_follow_ups fk_lab_follow_ups_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_result_follow_ups
    ADD CONSTRAINT fk_lab_follow_ups_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_lab_result_follow_ups fk_lab_follow_ups_recorder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_result_follow_ups
    ADD CONSTRAINT fk_lab_follow_ups_recorder FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_lab_result_follow_ups fk_lab_follow_ups_report; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_result_follow_ups
    ADD CONSTRAINT fk_lab_follow_ups_report FOREIGN KEY (practice_id, patient_id, lab_report_id) REFERENCES public.clinic_lab_reports(practice_id, patient_id, id);


--
-- Name: clinic_lab_result_follow_ups fk_lab_follow_ups_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_result_follow_ups
    ADD CONSTRAINT fk_lab_follow_ups_version FOREIGN KEY (practice_id, patient_id, lab_report_id, lab_report_version_id) REFERENCES public.clinic_lab_report_versions(practice_id, patient_id, lab_report_id, id);


--
-- Name: clinic_lab_reports fk_lab_reports_current_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_reports
    ADD CONSTRAINT fk_lab_reports_current_version FOREIGN KEY (practice_id, patient_id, id, current_version_id) REFERENCES public.clinic_lab_report_versions(practice_id, patient_id, lab_report_id, id);


--
-- Name: clinic_lab_reports fk_lab_reports_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_reports
    ADD CONSTRAINT fk_lab_reports_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_lab_reports fk_lab_reports_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_reports
    ADD CONSTRAINT fk_lab_reports_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_lab_report_versions fk_lab_versions_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_report_versions
    ADD CONSTRAINT fk_lab_versions_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_lab_report_versions fk_lab_versions_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_report_versions
    ADD CONSTRAINT fk_lab_versions_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_lab_report_versions fk_lab_versions_recorder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_report_versions
    ADD CONSTRAINT fk_lab_versions_recorder FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_lab_report_versions fk_lab_versions_report; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_report_versions
    ADD CONSTRAINT fk_lab_versions_report FOREIGN KEY (practice_id, patient_id, lab_report_id) REFERENCES public.clinic_lab_reports(practice_id, patient_id, id);


--
-- Name: clinic_lab_report_versions fk_lab_versions_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_lab_report_versions
    ADD CONSTRAINT fk_lab_versions_reviewer FOREIGN KEY (practice_id, reviewed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_medication_administration_movements fk_medication_admin_movements_administration; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administration_movements
    ADD CONSTRAINT fk_medication_admin_movements_administration FOREIGN KEY (practice_id, medication_administration_id) REFERENCES public.clinic_medication_administrations(practice_id, id);


--
-- Name: clinic_medication_administration_movements fk_medication_admin_movements_entry; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administration_movements
    ADD CONSTRAINT fk_medication_admin_movements_entry FOREIGN KEY (practice_id, inventory_entry_id) REFERENCES public.clinic_inventory_entries(practice_id, id);


--
-- Name: clinic_medication_administration_movements fk_medication_admin_movements_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administration_movements
    ADD CONSTRAINT fk_medication_admin_movements_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_medication_administrations fk_medication_administrations_actor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administrations
    ADD CONSTRAINT fk_medication_administrations_actor FOREIGN KEY (practice_id, administered_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_medication_administrations fk_medication_administrations_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administrations
    ADD CONSTRAINT fk_medication_administrations_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_medication_administrations fk_medication_administrations_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administrations
    ADD CONSTRAINT fk_medication_administrations_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_medication_administrations fk_medication_administrations_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administrations
    ADD CONSTRAINT fk_medication_administrations_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_medication_administrations fk_medication_administrations_product; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administrations
    ADD CONSTRAINT fk_medication_administrations_product FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_medication_administrations fk_medication_administrations_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_medication_administrations
    ADD CONSTRAINT fk_medication_administrations_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_message_attachments fk_message_attachments_document; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_attachments
    ADD CONSTRAINT fk_message_attachments_document FOREIGN KEY (practice_id, patient_id, document_id) REFERENCES public.clinic_documents(practice_id, patient_id, id);


--
-- Name: clinic_message_attachments fk_message_attachments_intent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_attachments
    ADD CONSTRAINT fk_message_attachments_intent FOREIGN KEY (practice_id, patient_id, message_intent_id) REFERENCES public.clinic_message_intents(practice_id, patient_id, id);


--
-- Name: clinic_message_attachments fk_message_attachments_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_attachments
    ADD CONSTRAINT fk_message_attachments_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_message_delivery_events fk_message_delivery_intent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_delivery_events
    ADD CONSTRAINT fk_message_delivery_intent FOREIGN KEY (practice_id, message_intent_id) REFERENCES public.clinic_message_intents(practice_id, id);


--
-- Name: clinic_message_intents fk_message_intents_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_intents
    ADD CONSTRAINT fk_message_intents_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_message_outbox fk_message_outbox_intent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_message_outbox
    ADD CONSTRAINT fk_message_outbox_intent FOREIGN KEY (practice_id, message_intent_id) REFERENCES public.clinic_message_intents(practice_id, id);


--
-- Name: clinic_encounter_note_revisions fk_note_revisions_author; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_revisions
    ADD CONSTRAINT fk_note_revisions_author FOREIGN KEY (practice_id, author_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_encounter_note_revisions fk_note_revisions_note; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_revisions
    ADD CONSTRAINT fk_note_revisions_note FOREIGN KEY (practice_id, note_id) REFERENCES public.clinic_encounter_notes(practice_id, id);


--
-- Name: clinic_encounter_note_revisions fk_note_revisions_predecessor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_revisions
    ADD CONSTRAINT fk_note_revisions_predecessor FOREIGN KEY (practice_id, note_id, prior_revision_id) REFERENCES public.clinic_encounter_note_revisions(practice_id, note_id, id);


--
-- Name: clinic_encounter_note_signatures fk_note_signatures_note; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_signatures
    ADD CONSTRAINT fk_note_signatures_note FOREIGN KEY (practice_id, note_id) REFERENCES public.clinic_encounter_notes(practice_id, id);


--
-- Name: clinic_encounter_note_signatures fk_note_signatures_revision; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_signatures
    ADD CONSTRAINT fk_note_signatures_revision FOREIGN KEY (practice_id, note_id, revision_id) REFERENCES public.clinic_encounter_note_revisions(practice_id, note_id, id);


--
-- Name: clinic_encounter_note_signatures fk_note_signatures_signer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_note_signatures
    ADD CONSTRAINT fk_note_signatures_signer FOREIGN KEY (practice_id, signer_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_observation_sources fk_observation_sources_derived; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observation_sources
    ADD CONSTRAINT fk_observation_sources_derived FOREIGN KEY (practice_id, patient_id, derived_observation_id) REFERENCES public.clinic_observations(practice_id, patient_id, id);


--
-- Name: clinic_observation_sources fk_observation_sources_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observation_sources
    ADD CONSTRAINT fk_observation_sources_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_observation_sources fk_observation_sources_source; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observation_sources
    ADD CONSTRAINT fk_observation_sources_source FOREIGN KEY (practice_id, patient_id, source_observation_id) REFERENCES public.clinic_observations(practice_id, patient_id, id);


--
-- Name: clinic_observations fk_observations_author; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observations
    ADD CONSTRAINT fk_observations_author FOREIGN KEY (practice_id, author_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_observations fk_observations_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observations
    ADD CONSTRAINT fk_observations_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_observations fk_observations_parent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_observations
    ADD CONSTRAINT fk_observations_parent FOREIGN KEY (practice_id, patient_id, parent_observation_id) REFERENCES public.clinic_observations(practice_id, patient_id, id);


--
-- Name: clinic_operation_receipts fk_operation_receipts_actor_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_operation_receipts
    ADD CONSTRAINT fk_operation_receipts_actor_membership FOREIGN KEY (practice_id, actor_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_operation_receipts fk_operation_receipts_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_operation_receipts
    ADD CONSTRAINT fk_operation_receipts_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_encounter_participants fk_participants_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_participants
    ADD CONSTRAINT fk_participants_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_encounter_participants fk_participants_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_participants
    ADD CONSTRAINT fk_participants_membership FOREIGN KEY (practice_id, membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_encounter_participants fk_participants_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_participants
    ADD CONSTRAINT fk_participants_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_address_versions fk_patient_addresses_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_address_versions
    ADD CONSTRAINT fk_patient_addresses_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_memberships fk_patient_memberships_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_memberships
    ADD CONSTRAINT fk_patient_memberships_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_memberships fk_patient_memberships_recorded_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_memberships
    ADD CONSTRAINT fk_patient_memberships_recorded_by FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_appointment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_appointment FOREIGN KEY (practice_id, appointment_id) REFERENCES public.clinic_appointments(practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_identity; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_identity FOREIGN KEY (practice_id, identity_id) REFERENCES public.clinic_patient_portal_identities(practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_reviewer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_reviewer FOREIGN KEY (practice_id, reviewed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_source_appointment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_source_appointment FOREIGN KEY (practice_id, source_appointment_id) REFERENCES public.clinic_appointments(practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_source_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_source_site FOREIGN KEY (practice_id, source_site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_visit_type; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_visit_type FOREIGN KEY (practice_id, visit_type_id) REFERENCES public.clinic_visit_types(practice_id, id);


--
-- Name: clinic_patient_portal_identities fk_patient_portal_identities_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_identities
    ADD CONSTRAINT fk_patient_portal_identities_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_portal_identities fk_patient_portal_identities_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_identities
    ADD CONSTRAINT fk_patient_portal_identities_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_portal_identities fk_patient_portal_identities_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_identities
    ADD CONSTRAINT fk_patient_portal_identities_user FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: clinic_patient_portal_requests fk_patient_portal_requests_identity; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_requests
    ADD CONSTRAINT fk_patient_portal_requests_identity FOREIGN KEY (practice_id, identity_id) REFERENCES public.clinic_patient_portal_identities(practice_id, id);


--
-- Name: clinic_patient_portal_requests fk_patient_portal_requests_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_requests
    ADD CONSTRAINT fk_patient_portal_requests_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_portal_requests fk_patient_portal_requests_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_requests
    ADD CONSTRAINT fk_patient_portal_requests_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_patient_reminder_actions fk_patient_reminder_actions_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_actions
    ADD CONSTRAINT fk_patient_reminder_actions_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patient_reminder_actions fk_patient_reminder_actions_reminder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_actions
    ADD CONSTRAINT fk_patient_reminder_actions_reminder FOREIGN KEY (practice_id, reminder_id) REFERENCES public.clinic_patient_reminders(practice_id, id);


--
-- Name: clinic_patient_reminder_delivery_attempts fk_patient_reminder_attempts_reminder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_delivery_attempts
    ADD CONSTRAINT fk_patient_reminder_attempts_reminder FOREIGN KEY (practice_id, reminder_id) REFERENCES public.clinic_patient_reminders(practice_id, id);


--
-- Name: clinic_patient_reminder_outbox fk_patient_reminder_outbox_reminder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_outbox
    ADD CONSTRAINT fk_patient_reminder_outbox_reminder FOREIGN KEY (practice_id, reminder_id) REFERENCES public.clinic_patient_reminders(practice_id, id);


--
-- Name: clinic_patient_reminders fk_patient_reminders_endpoint; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminders
    ADD CONSTRAINT fk_patient_reminders_endpoint FOREIGN KEY (practice_id, communication_endpoint_id) REFERENCES public.clinic_communication_endpoints(practice_id, id);


--
-- Name: clinic_patient_reminders fk_patient_reminders_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminders
    ADD CONSTRAINT fk_patient_reminders_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_patients fk_patients_primary_address; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patients
    ADD CONSTRAINT fk_patients_primary_address FOREIGN KEY (practice_id, id, primary_address_version_id) REFERENCES public.clinic_patient_address_versions(practice_id, patient_id, id);


--
-- Name: clinic_payment_allocations fk_payment_allocations_invoice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_allocations
    ADD CONSTRAINT fk_payment_allocations_invoice FOREIGN KEY (practice_id, patient_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, patient_id, id);


--
-- Name: clinic_payment_allocations fk_payment_allocations_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_allocations
    ADD CONSTRAINT fk_payment_allocations_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_payment_allocations fk_payment_allocations_payment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_allocations
    ADD CONSTRAINT fk_payment_allocations_payment FOREIGN KEY (practice_id, patient_id, payment_event_id) REFERENCES public.clinic_payment_events(practice_id, patient_id, id);


--
-- Name: clinic_payment_collection_intents fk_payment_collection_intents_invoice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_collection_intents
    ADD CONSTRAINT fk_payment_collection_intents_invoice FOREIGN KEY (practice_id, patient_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, patient_id, id);


--
-- Name: clinic_payment_collection_intents fk_payment_collection_intents_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_collection_intents
    ADD CONSTRAINT fk_payment_collection_intents_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_payment_collection_intents fk_payment_collection_intents_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_collection_intents
    ADD CONSTRAINT fk_payment_collection_intents_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_payment_events fk_payment_events_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_events
    ADD CONSTRAINT fk_payment_events_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_payment_processor_events fk_payment_processor_events_intent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_processor_events
    ADD CONSTRAINT fk_payment_processor_events_intent FOREIGN KEY (practice_id, payment_collection_intent_id) REFERENCES public.clinic_payment_collection_intents(practice_id, id);


--
-- Name: clinic_payment_processor_events fk_payment_processor_events_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_processor_events
    ADD CONSTRAINT fk_payment_processor_events_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_payment_processor_events fk_payment_processor_events_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_processor_events
    ADD CONSTRAINT fk_payment_processor_events_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_pharmacy_products fk_pharmacy_products_preferred_supplier; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_products
    ADD CONSTRAINT fk_pharmacy_products_preferred_supplier FOREIGN KEY (practice_id, preferred_supplier_id) REFERENCES public.clinic_inventory_suppliers(practice_id, id);


--
-- Name: clinic_practices fk_practices_organization; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_practices
    ADD CONSTRAINT fk_practices_organization FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: clinic_encounter_precautions fk_precautions_reassessor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_precautions
    ADD CONSTRAINT fk_precautions_reassessor FOREIGN KEY (practice_id, reassessed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_encounter_precautions fk_precautions_recorder; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_precautions
    ADD CONSTRAINT fk_precautions_recorder FOREIGN KEY (practice_id, recorded_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_previsit_notes fk_previsit_notes_appointment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_previsit_notes
    ADD CONSTRAINT fk_previsit_notes_appointment FOREIGN KEY (practice_id, patient_id, appointment_id) REFERENCES public.clinic_appointments(practice_id, patient_id, id);


--
-- Name: clinic_previsit_notes fk_previsit_notes_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_previsit_notes
    ADD CONSTRAINT fk_previsit_notes_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_previsit_notes fk_previsit_notes_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_previsit_notes
    ADD CONSTRAINT fk_previsit_notes_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_previsit_notes fk_previsit_notes_submitter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_previsit_notes
    ADD CONSTRAINT fk_previsit_notes_submitter FOREIGN KEY (submitted_by_user_id) REFERENCES public.users(id);


--
-- Name: clinic_clinician_profiles fk_profiles_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_profiles
    ADD CONSTRAINT fk_profiles_membership FOREIGN KEY (practice_id, membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_vendor_returns fk_rails_0112c0d1f0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_vendor_returns
    ADD CONSTRAINT fk_rails_0112c0d1f0 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_schedule_templates fk_rails_01a38e595e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_templates
    ADD CONSTRAINT fk_rails_01a38e595e FOREIGN KEY (practice_id, created_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_subscription_packages fk_rails_031ea5adc0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_packages
    ADD CONSTRAINT fk_rails_031ea5adc0 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_punch_challenges fk_rails_038aad3ae1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punch_challenges
    ADD CONSTRAINT fk_rails_038aad3ae1 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_scribe_draft_sections fk_rails_0401b6e372; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_draft_sections
    ADD CONSTRAINT fk_rails_0401b6e372 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_punch_challenges fk_rails_043cc3740f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punch_challenges
    ADD CONSTRAINT fk_rails_043cc3740f FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_inventory_purchase_carts fk_rails_04945c9aa9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_carts
    ADD CONSTRAINT fk_rails_04945c9aa9 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_entries fk_rails_0595133f54; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_0595133f54 FOREIGN KEY (transfer_id) REFERENCES public.clinic_inventory_transfers(id);


--
-- Name: clinic_workforce_schedule_drafts fk_rails_076786827a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_drafts
    ADD CONSTRAINT fk_rails_076786827a FOREIGN KEY (practice_id, created_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_patient_reminder_actions fk_rails_077e2054a1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_actions
    ADD CONSTRAINT fk_rails_077e2054a1 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_receiving_sessions fk_rails_07ff713eaf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receiving_sessions
    ADD CONSTRAINT fk_rails_07ff713eaf FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_telehealth_participants fk_rails_09723b30c4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_participants
    ADD CONSTRAINT fk_rails_09723b30c4 FOREIGN KEY (practice_id, portal_identity_id) REFERENCES public.clinic_patient_portal_identities(practice_id, id);


--
-- Name: clinic_inventory_shipment_reconciliations fk_rails_0a8145c02d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_reconciliations
    ADD CONSTRAINT fk_rails_0a8145c02d FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_purchase_orders fk_rails_0b69215dbe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_orders
    ADD CONSTRAINT fk_rails_0b69215dbe FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_receipt_lines fk_rails_0cef3ad1bc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipt_lines
    ADD CONSTRAINT fk_rails_0cef3ad1bc FOREIGN KEY (practice_id, receipt_id) REFERENCES public.clinic_inventory_receipts(practice_id, id);


--
-- Name: clinic_telehealth_join_grants fk_rails_0d11535ca4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_join_grants
    ADD CONSTRAINT fk_rails_0d11535ca4 FOREIGN KEY (practice_id, participant_id) REFERENCES public.clinic_telehealth_participants(practice_id, id);


--
-- Name: clinic_items fk_rails_0eb41eb72a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_items
    ADD CONSTRAINT fk_rails_0eb41eb72a FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_consents fk_rails_103f951780; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_consents
    ADD CONSTRAINT fk_rails_103f951780 FOREIGN KEY (practice_id, policy_version_id) REFERENCES public.clinic_telehealth_policy_versions(practice_id, id);


--
-- Name: clinic_inventory_purchase_order_lines fk_rails_1045935d36; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_lines
    ADD CONSTRAINT fk_rails_1045935d36 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_working_drafts fk_rails_11f3c038e4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_working_drafts
    ADD CONSTRAINT fk_rails_11f3c038e4 FOREIGN KEY (practice_id, actor_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_telehealth_provider_events fk_rails_128e080be9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_provider_events
    ADD CONSTRAINT fk_rails_128e080be9 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_transfers fk_rails_13090eedc1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers
    ADD CONSTRAINT fk_rails_13090eedc1 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_subscription_versions fk_rails_133849c302; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_versions
    ADD CONSTRAINT fk_rails_133849c302 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_scribe_sources fk_rails_135679e729; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_sources
    ADD CONSTRAINT fk_rails_135679e729 FOREIGN KEY (practice_id, telehealth_visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_inventory_receipts fk_rails_139720b987; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_139720b987 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_count_approvals fk_rails_13987252d5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals
    ADD CONSTRAINT fk_rails_13987252d5 FOREIGN KEY (practice_id, count_id) REFERENCES public.clinic_inventory_counts(practice_id, id);


--
-- Name: clinic_workforce_export_batches fk_rails_13cff6c007; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_export_batches
    ADD CONSTRAINT fk_rails_13cff6c007 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_workforce_shifts fk_rails_160fc3c8d0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shifts
    ADD CONSTRAINT fk_rails_160fc3c8d0 FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_workforce_employee_invitations fk_rails_162210adb9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employee_invitations
    ADD CONSTRAINT fk_rails_162210adb9 FOREIGN KEY (practice_id, staff_member_id) REFERENCES public.clinic_staff_members(practice_id, id);


--
-- Name: clinic_inventory_recall_dispositions fk_rails_17f1c16d24; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_dispositions
    ADD CONSTRAINT fk_rails_17f1c16d24 FOREIGN KEY (practice_id, recall_id) REFERENCES public.clinic_inventory_recalls(practice_id, id);


--
-- Name: clinic_inventory_entries fk_rails_18c6876842; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_18c6876842 FOREIGN KEY (practice_id, item_id) REFERENCES public.clinic_items(practice_id, id);


--
-- Name: clinic_telehealth_participants fk_rails_194567602d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_participants
    ADD CONSTRAINT fk_rails_194567602d FOREIGN KEY (practice_id, admitted_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_supplier_invoices fk_rails_199cad596f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_invoices
    ADD CONSTRAINT fk_rails_199cad596f FOREIGN KEY (practice_id, supersedes_id) REFERENCES public.clinic_inventory_supplier_invoices(practice_id, id);


--
-- Name: clinic_pharmacy_batches fk_rails_19fd59cee4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches
    ADD CONSTRAINT fk_rails_19fd59cee4 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_patient_reminder_outbox fk_rails_1ad60c4e29; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_outbox
    ADD CONSTRAINT fk_rails_1ad60c4e29 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_kiosk_enrollments fk_rails_1bf29cc8cc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_enrollments
    ADD CONSTRAINT fk_rails_1bf29cc8cc FOREIGN KEY (practice_id, revoked_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_workforce_schedule_drafts fk_rails_1c01481252; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_drafts
    ADD CONSTRAINT fk_rails_1c01481252 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_1db6515ca2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_1db6515ca2 FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_inventory_purchase_order_events fk_rails_1dcd7a8add; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_events
    ADD CONSTRAINT fk_rails_1dcd7a8add FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_purchase_cart_items fk_rails_22304a7fa5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_cart_items
    ADD CONSTRAINT fk_rails_22304a7fa5 FOREIGN KEY (practice_id, cart_id) REFERENCES public.clinic_inventory_purchase_carts(practice_id, id);


--
-- Name: clinic_scribe_encounters fk_rails_22a1977aad; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_encounters
    ADD CONSTRAINT fk_rails_22a1977aad FOREIGN KEY (context_authored_by_id) REFERENCES public.users(id);


--
-- Name: clinic_pharmacy_batch_events fk_rails_22ef15e821; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batch_events
    ADD CONSTRAINT fk_rails_22ef15e821 FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_workforce_schedule_templates fk_rails_231dc3c4f9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_templates
    ADD CONSTRAINT fk_rails_231dc3c4f9 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_shift_swap_requests fk_rails_23fbbae981; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT fk_rails_23fbbae981 FOREIGN KEY (practice_id, reviewed_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_payroll_configuration_versions fk_rails_26b6e8a3aa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_payroll_configuration_versions
    ADD CONSTRAINT fk_rails_26b6e8a3aa FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_scribe_exports fk_rails_27114baaa9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_exports
    ADD CONSTRAINT fk_rails_27114baaa9 FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: clinic_billing_receipts fk_rails_273fc7946f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_receipts
    ADD CONSTRAINT fk_rails_273fc7946f FOREIGN KEY (issued_by_id) REFERENCES public.users(id);


--
-- Name: clinic_subscription_events fk_rails_27685432e5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_events
    ADD CONSTRAINT fk_rails_27685432e5 FOREIGN KEY (practice_id, agreement_id) REFERENCES public.clinic_subscription_agreements(practice_id, id);


--
-- Name: clinic_scribe_encounters fk_rails_2779dfb925; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_encounters
    ADD CONSTRAINT fk_rails_2779dfb925 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_settings_versions fk_rails_278bfef16b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_settings_versions
    ADD CONSTRAINT fk_rails_278bfef16b FOREIGN KEY (practice_id, created_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_count_approvals fk_rails_27cf416d6e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals
    ADD CONSTRAINT fk_rails_27cf416d6e FOREIGN KEY (practice_id, entry_id) REFERENCES public.clinic_inventory_entries(practice_id, id);


--
-- Name: clinic_inventory_holds fk_rails_2878d75e47; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_2878d75e47 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_workforce_payroll_configuration_versions fk_rails_29ddf909a9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_payroll_configuration_versions
    ADD CONSTRAINT fk_rails_29ddf909a9 FOREIGN KEY (practice_id, created_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_subscription_versions fk_rails_29f8406e39; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_versions
    ADD CONSTRAINT fk_rails_29f8406e39 FOREIGN KEY (practice_id, package_id) REFERENCES public.clinic_subscription_packages(practice_id, id);


--
-- Name: clinic_inventory_receipts fk_rails_2adca6eead; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_2adca6eead FOREIGN KEY (practice_id, supplier_id) REFERENCES public.clinic_inventory_suppliers(practice_id, id);


--
-- Name: clinic_scribe_source_segments fk_rails_2af52e831f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_source_segments
    ADD CONSTRAINT fk_rails_2af52e831f FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: paperworks fk_rails_2c6930f769; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paperworks
    ADD CONSTRAINT fk_rails_2c6930f769 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: clinic_cash_drawer_sessions fk_rails_2c6b70c160; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions
    ADD CONSTRAINT fk_rails_2c6b70c160 FOREIGN KEY (site_id) REFERENCES public.clinic_sites(id);


--
-- Name: clinic_scribe_exports fk_rails_2ccd0c4a3e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_exports
    ADD CONSTRAINT fk_rails_2ccd0c4a3e FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_supplier_invoices fk_rails_2d01370453; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_invoices
    ADD CONSTRAINT fk_rails_2d01370453 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_inventory_shipments fk_rails_2d1edd10fd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipments
    ADD CONSTRAINT fk_rails_2d1edd10fd FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_counts fk_rails_2d9bb8312a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT fk_rails_2d9bb8312a FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_pharmacy_movements fk_rails_2f2f92d2de; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_movements
    ADD CONSTRAINT fk_rails_2f2f92d2de FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_telehealth_provider_events fk_rails_2f5d36bf39; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_provider_events
    ADD CONSTRAINT fk_rails_2f5d36bf39 FOREIGN KEY (practice_id, participant_id) REFERENCES public.clinic_telehealth_participants(practice_id, id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_2ff43dd588; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_2ff43dd588 FOREIGN KEY (practice_id, scribe_encounter_id) REFERENCES public.clinic_scribe_encounters(practice_id, id);


--
-- Name: clinic_inventory_control_reviews fk_rails_30306e2c82; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_control_reviews
    ADD CONSTRAINT fk_rails_30306e2c82 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_time_off_requests fk_rails_307c687e13; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_off_requests
    ADD CONSTRAINT fk_rails_307c687e13 FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_workforce_badge_credentials fk_rails_30cb894fe8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_badge_credentials
    ADD CONSTRAINT fk_rails_30cb894fe8 FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_inventory_profiles fk_rails_30d58630f8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_profiles
    ADD CONSTRAINT fk_rails_30d58630f8 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_visits fk_rails_30ec88d827; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_30ec88d827 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_cash_drawer_sessions fk_rails_3168137046; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions
    ADD CONSTRAINT fk_rails_3168137046 FOREIGN KEY (closed_by_id) REFERENCES public.users(id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_32b00b3677; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_32b00b3677 FOREIGN KEY (practice_id, patient_id, appointment_id) REFERENCES public.clinic_appointments(practice_id, patient_id, id);


--
-- Name: clinic_cash_tenders fk_rails_3309419654; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders
    ADD CONSTRAINT fk_rails_3309419654 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_export_batches fk_rails_346f4cde3f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_export_batches
    ADD CONSTRAINT fk_rails_346f4cde3f FOREIGN KEY (practice_id, created_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_invoice_stripe_checkouts fk_rails_347bee8fa4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_stripe_checkouts
    ADD CONSTRAINT fk_rails_347bee8fa4 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_scribe_lab_selections fk_rails_34933da4f2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_lab_selections
    ADD CONSTRAINT fk_rails_34933da4f2 FOREIGN KEY (selected_by_id) REFERENCES public.users(id);


--
-- Name: clinic_workforce_employee_invitations fk_rails_3497a94c22; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employee_invitations
    ADD CONSTRAINT fk_rails_3497a94c22 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_hold_releases fk_rails_34bdf26d4a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases
    ADD CONSTRAINT fk_rails_34bdf26d4a FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_stripe_checkouts fk_rails_36031bc572; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_checkouts
    ADD CONSTRAINT fk_rails_36031bc572 FOREIGN KEY (practice_id, connection_id) REFERENCES public.clinic_stripe_connections(practice_id, id);


--
-- Name: clinic_stripe_connections fk_rails_37e731ddae; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_connections
    ADD CONSTRAINT fk_rails_37e731ddae FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_visit_type_rules fk_rails_3830f653b2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visit_type_rules
    ADD CONSTRAINT fk_rails_3830f653b2 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_holds fk_rails_384dda0594; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_384dda0594 FOREIGN KEY (transfer_id) REFERENCES public.clinic_inventory_transfers(id);


--
-- Name: clinic_inventory_purchase_cart_items fk_rails_38d27f8544; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_cart_items
    ADD CONSTRAINT fk_rails_38d27f8544 FOREIGN KEY (practice_id, selected_supplier_id) REFERENCES public.clinic_inventory_suppliers(practice_id, id);


--
-- Name: clinic_workforce_punches fk_rails_38e293b876; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punches
    ADD CONSTRAINT fk_rails_38e293b876 FOREIGN KEY (practice_id, kiosk_session_id) REFERENCES public.clinic_workforce_kiosk_sessions(practice_id, id);


--
-- Name: clinic_communication_endpoints fk_rails_38fc29fa5f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_communication_endpoints
    ADD CONSTRAINT fk_rails_38fc29fa5f FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_commands fk_rails_3933c6c99f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_commands
    ADD CONSTRAINT fk_rails_3933c6c99f FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_transfers fk_rails_3979f721e6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers
    ADD CONSTRAINT fk_rails_3979f721e6 FOREIGN KEY (practice_id, source_batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_inventory_purchase_carts fk_rails_39f6908f25; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_carts
    ADD CONSTRAINT fk_rails_39f6908f25 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_recall_lots fk_rails_3b3b32f39b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_lots
    ADD CONSTRAINT fk_rails_3b3b32f39b FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_pharmacy_movements fk_rails_3ba75f9cd3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_movements
    ADD CONSTRAINT fk_rails_3ba75f9cd3 FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_telehealth_consents fk_rails_3c54a101da; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_consents
    ADD CONSTRAINT fk_rails_3c54a101da FOREIGN KEY (practice_id, visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_3c6710e91f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_3c6710e91f FOREIGN KEY (practice_id, created_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_telehealth_checkins fk_rails_3c8fde2025; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_checkins
    ADD CONSTRAINT fk_rails_3c8fde2025 FOREIGN KEY (practice_id, supersedes_checkin_id) REFERENCES public.clinic_telehealth_checkins(practice_id, id);


--
-- Name: clinic_inventory_hold_releases fk_rails_3cb4861c1b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases
    ADD CONSTRAINT fk_rails_3cb4861c1b FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_inventory_supplier_products fk_rails_3cee723161; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_products
    ADD CONSTRAINT fk_rails_3cee723161 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_invoice_stripe_checkouts fk_rails_3d79852221; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_stripe_checkouts
    ADD CONSTRAINT fk_rails_3d79852221 FOREIGN KEY (practice_id, collection_intent_id) REFERENCES public.clinic_payment_collection_intents(practice_id, id);


--
-- Name: clinic_inventory_receiving_sessions fk_rails_3f09c6a418; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receiving_sessions
    ADD CONSTRAINT fk_rails_3f09c6a418 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_timecard_versions fk_rails_3fe0b246b7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_timecard_versions
    ADD CONSTRAINT fk_rails_3fe0b246b7 FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_inventory_recall_lots fk_rails_40cc42df76; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_lots
    ADD CONSTRAINT fk_rails_40cc42df76 FOREIGN KEY (practice_id, lot_id) REFERENCES public.clinic_inventory_lots(practice_id, id);


--
-- Name: clinic_workforce_adjustment_requests fk_rails_41eb6fb51c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_adjustment_requests
    ADD CONSTRAINT fk_rails_41eb6fb51c FOREIGN KEY (practice_id, requested_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_billing_receipts fk_rails_4259348069; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_receipts
    ADD CONSTRAINT fk_rails_4259348069 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_purchase_orders fk_rails_42cc214e38; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_orders
    ADD CONSTRAINT fk_rails_42cc214e38 FOREIGN KEY (practice_id, supplier_id) REFERENCES public.clinic_inventory_suppliers(practice_id, id);


--
-- Name: clinic_telehealth_patient_receipts fk_rails_43c4d415fc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_patient_receipts
    ADD CONSTRAINT fk_rails_43c4d415fc FOREIGN KEY (practice_id, portal_identity_id) REFERENCES public.clinic_patient_portal_identities(practice_id, id);


--
-- Name: clinic_workforce_punches fk_rails_43f74c088e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punches
    ADD CONSTRAINT fk_rails_43f74c088e FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_working_drafts fk_rails_4408792dfd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_working_drafts
    ADD CONSTRAINT fk_rails_4408792dfd FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_telehealth_visits fk_rails_444013bc41; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_444013bc41 FOREIGN KEY (practice_id, created_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_recall_dispositions fk_rails_447e3e1e2e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_dispositions
    ADD CONSTRAINT fk_rails_447e3e1e2e FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_badge_credentials fk_rails_468431674b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_badge_credentials
    ADD CONSTRAINT fk_rails_468431674b FOREIGN KEY (practice_id, replaced_by_id) REFERENCES public.clinic_workforce_badge_credentials(practice_id, id);


--
-- Name: clinic_inventory_shipment_reconciliations fk_rails_470906eeb9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_reconciliations
    ADD CONSTRAINT fk_rails_470906eeb9 FOREIGN KEY (practice_id, shipment_id) REFERENCES public.clinic_inventory_shipments(practice_id, id);


--
-- Name: clinic_workforce_employments fk_rails_477f216f99; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employments
    ADD CONSTRAINT fk_rails_477f216f99 FOREIGN KEY (practice_id, membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_telehealth_commands fk_rails_48d6c09072; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_commands
    ADD CONSTRAINT fk_rails_48d6c09072 FOREIGN KEY (practice_id, visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_inventory_vendor_returns fk_rails_496020bffe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_vendor_returns
    ADD CONSTRAINT fk_rails_496020bffe FOREIGN KEY (practice_id, receipt_line_id) REFERENCES public.clinic_inventory_receipt_lines(practice_id, id);


--
-- Name: clinic_workforce_timecard_versions fk_rails_4971abfd60; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_timecard_versions
    ADD CONSTRAINT fk_rails_4971abfd60 FOREIGN KEY (practice_id, approved_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_profiles fk_rails_4a6252adbd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_profiles
    ADD CONSTRAINT fk_rails_4a6252adbd FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_telehealth_room_attempts fk_rails_4bdb009ae7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_room_attempts
    ADD CONSTRAINT fk_rails_4bdb009ae7 FOREIGN KEY (practice_id, visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_inventory_vendor_returns fk_rails_4bf2be11f1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_vendor_returns
    ADD CONSTRAINT fk_rails_4bf2be11f1 FOREIGN KEY (practice_id, entry_id) REFERENCES public.clinic_inventory_entries(practice_id, id);


--
-- Name: clinic_workforce_time_segments fk_rails_4bf7201ea6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_segments
    ADD CONSTRAINT fk_rails_4bf7201ea6 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_workforce_schedule_publications fk_rails_4f972e7f1f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_publications
    ADD CONSTRAINT fk_rails_4f972e7f1f FOREIGN KEY (practice_id, published_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_communication_preferences fk_rails_5034e8ba41; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_communication_preferences
    ADD CONSTRAINT fk_rails_5034e8ba41 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_entries fk_rails_538fd2b9b7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_538fd2b9b7 FOREIGN KEY (practice_id, receipt_line_id) REFERENCES public.clinic_inventory_receipt_lines(practice_id, id);


--
-- Name: clinic_inventory_shipments fk_rails_53c98672d2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipments
    ADD CONSTRAINT fk_rails_53c98672d2 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_shift_swap_requests fk_rails_54cb12a1e8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT fk_rails_54cb12a1e8 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_cash_drawer_sessions fk_rails_55951ba890; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions
    ADD CONSTRAINT fk_rails_55951ba890 FOREIGN KEY (opened_by_id) REFERENCES public.users(id);


--
-- Name: clinic_telehealth_settings fk_rails_55fe5a64ed; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_settings
    ADD CONSTRAINT fk_rails_55fe5a64ed FOREIGN KEY (practice_id, active_policy_version_id) REFERENCES public.clinic_telehealth_policy_versions(practice_id, id);


--
-- Name: clinic_telehealth_policy_versions fk_rails_56ff0bb49c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_policy_versions
    ADD CONSTRAINT fk_rails_56ff0bb49c FOREIGN KEY (practice_id, published_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_supplier_invoices fk_rails_573b65e26e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_invoices
    ADD CONSTRAINT fk_rails_573b65e26e FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_purchase_order_lines fk_rails_5a2f2d239a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_lines
    ADD CONSTRAINT fk_rails_5a2f2d239a FOREIGN KEY (practice_id, supplier_product_id) REFERENCES public.clinic_inventory_supplier_products(practice_id, id);


--
-- Name: clinic_workforce_settings_versions fk_rails_5ba5996cc6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_settings_versions
    ADD CONSTRAINT fk_rails_5ba5996cc6 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_time_off_requests fk_rails_5bc99aa01c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_off_requests
    ADD CONSTRAINT fk_rails_5bc99aa01c FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_recalls fk_rails_5c3a4539ae; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recalls
    ADD CONSTRAINT fk_rails_5c3a4539ae FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_stripe_connections fk_rails_5cbcc34381; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_connections
    ADD CONSTRAINT fk_rails_5cbcc34381 FOREIGN KEY (connected_by_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_catalog_events fk_rails_5d0903c7f3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events
    ADD CONSTRAINT fk_rails_5d0903c7f3 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_kiosk_sessions fk_rails_5d1fc20fb8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_sessions
    ADD CONSTRAINT fk_rails_5d1fc20fb8 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_5dfe5faa88; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_5dfe5faa88 FOREIGN KEY (practice_id, scribe_draft_id) REFERENCES public.clinic_scribe_drafts(practice_id, id);


--
-- Name: clinic_workforce_punches fk_rails_5e65f1e661; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punches
    ADD CONSTRAINT fk_rails_5e65f1e661 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_telehealth_visits fk_rails_5ea7ce9f3d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_5ea7ce9f3d FOREIGN KEY (practice_id, appointment_id) REFERENCES public.clinic_appointments(practice_id, id);


--
-- Name: clinic_workforce_adjustment_requests fk_rails_5ec252c636; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_adjustment_requests
    ADD CONSTRAINT fk_rails_5ec252c636 FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_telehealth_checkins fk_rails_5f0a50aae7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_checkins
    ADD CONSTRAINT fk_rails_5f0a50aae7 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_subscription_packages fk_rails_6025a8e95b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_packages
    ADD CONSTRAINT fk_rails_6025a8e95b FOREIGN KEY (practice_id, family_id) REFERENCES public.clinic_subscription_families(practice_id, id);


--
-- Name: clinic_workforce_availability_versions fk_rails_602daedec6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_availability_versions
    ADD CONSTRAINT fk_rails_602daedec6 FOREIGN KEY (practice_id, created_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_telehealth_participants fk_rails_61a6855fcf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_participants
    ADD CONSTRAINT fk_rails_61a6855fcf FOREIGN KEY (practice_id, visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_scribe_documents fk_rails_61db680528; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_documents
    ADD CONSTRAINT fk_rails_61db680528 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_locations fk_rails_6200766107; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_locations
    ADD CONSTRAINT fk_rails_6200766107 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_purchase_order_lines fk_rails_626414f2a5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_lines
    ADD CONSTRAINT fk_rails_626414f2a5 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_scribe_drafts fk_rails_62b14c25ce; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts
    ADD CONSTRAINT fk_rails_62b14c25ce FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_purchase_cart_items fk_rails_62d7a23a8c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_cart_items
    ADD CONSTRAINT fk_rails_62d7a23a8c FOREIGN KEY (practice_id, purchase_order_line_id) REFERENCES public.clinic_inventory_purchase_order_lines(practice_id, id);


--
-- Name: clinic_subscription_agreements fk_rails_650da6ee4a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_agreements
    ADD CONSTRAINT fk_rails_650da6ee4a FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_join_grants fk_rails_671e4b0b6a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_join_grants
    ADD CONSTRAINT fk_rails_671e4b0b6a FOREIGN KEY (practice_id, room_attempt_id) REFERENCES public.clinic_telehealth_room_attempts(practice_id, id);


--
-- Name: clinic_inventory_holds fk_rails_6720c0ef31; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_6720c0ef31 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_memberships fk_rails_6824078e73; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_memberships
    ADD CONSTRAINT fk_rails_6824078e73 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_cash_drawer_sessions fk_rails_69cfbcfdf4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions
    ADD CONSTRAINT fk_rails_69cfbcfdf4 FOREIGN KEY (reconciled_by_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_shipment_reconciliations fk_rails_69dc3f4896; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_reconciliations
    ADD CONSTRAINT fk_rails_69dc3f4896 FOREIGN KEY (practice_id, receipt_id) REFERENCES public.clinic_inventory_receipts(practice_id, id);


--
-- Name: clinic_inventory_supplier_credits fk_rails_6a0567058a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_credits
    ADD CONSTRAINT fk_rails_6a0567058a FOREIGN KEY (practice_id, vendor_return_id) REFERENCES public.clinic_inventory_vendor_returns(practice_id, id);


--
-- Name: learning_progresses fk_rails_6ade58a529; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_progresses
    ADD CONSTRAINT fk_rails_6ade58a529 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: clinic_notes fk_rails_6cca2d829b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes
    ADD CONSTRAINT fk_rails_6cca2d829b FOREIGN KEY (author_id) REFERENCES public.users(id);


--
-- Name: clinic_telehealth_consents fk_rails_6e39cd498d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_consents
    ADD CONSTRAINT fk_rails_6e39cd498d FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_catalog_events fk_rails_6e4308849d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events
    ADD CONSTRAINT fk_rails_6e4308849d FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: identity_preferences fk_rails_6f731ca26a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.identity_preferences
    ADD CONSTRAINT fk_rails_6f731ca26a FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: clinic_workforce_settings_versions fk_rails_6fa8693b57; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_settings_versions
    ADD CONSTRAINT fk_rails_6fa8693b57 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_scribe_recordings fk_rails_7033134891; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recordings
    ADD CONSTRAINT fk_rails_7033134891 FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_purchase_order_events fk_rails_70745ee0a1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_events
    ADD CONSTRAINT fk_rails_70745ee0a1 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_service_options fk_rails_715983834e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_service_options
    ADD CONSTRAINT fk_rails_715983834e FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_visits fk_rails_71b594b7c0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_71b594b7c0 FOREIGN KEY (practice_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, id);


--
-- Name: clinic_patient_reminder_actions fk_rails_727793d841; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_actions
    ADD CONSTRAINT fk_rails_727793d841 FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: clinic_workforce_kiosk_enrollments fk_rails_732019edfb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_enrollments
    ADD CONSTRAINT fk_rails_732019edfb FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_scribe_sources fk_rails_73e242fd45; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_sources
    ADD CONSTRAINT fk_rails_73e242fd45 FOREIGN KEY (imported_by_id) REFERENCES public.users(id);


--
-- Name: clinic_workforce_badge_credentials fk_rails_76a2633323; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_badge_credentials
    ADD CONSTRAINT fk_rails_76a2633323 FOREIGN KEY (practice_id, revoked_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_entries fk_rails_76b53b8f85; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_76b53b8f85 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_pharmacy_batch_events fk_rails_77b24f8a5a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batch_events
    ADD CONSTRAINT fk_rails_77b24f8a5a FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_stripe_membership_cycles fk_rails_77bf701067; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_membership_cycles
    ADD CONSTRAINT fk_rails_77bf701067 FOREIGN KEY (practice_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, id);


--
-- Name: clinic_inventory_control_reviews fk_rails_7845ca3bcb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_control_reviews
    ADD CONSTRAINT fk_rails_7845ca3bcb FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_notes fk_rails_78e5dea8d0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes
    ADD CONSTRAINT fk_rails_78e5dea8d0 FOREIGN KEY (practice_id, author_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_797a80c709; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_797a80c709 FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_inventory_transfers fk_rails_7a15973961; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers
    ADD CONSTRAINT fk_rails_7a15973961 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_schedule_publications fk_rails_7ae8db05fb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_publications
    ADD CONSTRAINT fk_rails_7ae8db05fb FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_purchase_carts fk_rails_7afadccbc9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_carts
    ADD CONSTRAINT fk_rails_7afadccbc9 FOREIGN KEY (destination_site_id) REFERENCES public.clinic_sites(id);


--
-- Name: clinic_stripe_checkouts fk_rails_7b57f27555; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_checkouts
    ADD CONSTRAINT fk_rails_7b57f27555 FOREIGN KEY (practice_id, agreement_id) REFERENCES public.clinic_subscription_agreements(practice_id, id);


--
-- Name: clinic_telehealth_join_grants fk_rails_7b811f2438; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_join_grants
    ADD CONSTRAINT fk_rails_7b811f2438 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_counts fk_rails_7c1445f2e5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT fk_rails_7c1445f2e5 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_inventory_supplier_credits fk_rails_7c6f73bc59; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_credits
    ADD CONSTRAINT fk_rails_7c6f73bc59 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_supplier_products fk_rails_7c70ba7382; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_products
    ADD CONSTRAINT fk_rails_7c70ba7382 FOREIGN KEY (practice_id, supplier_id) REFERENCES public.clinic_inventory_suppliers(practice_id, id);


--
-- Name: clinic_workforce_time_segments fk_rails_808d39eb3b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_segments
    ADD CONSTRAINT fk_rails_808d39eb3b FOREIGN KEY (practice_id, timecard_version_id) REFERENCES public.clinic_workforce_timecard_versions(practice_id, id);


--
-- Name: clinic_workforce_adjustment_requests fk_rails_81de23790d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_adjustment_requests
    ADD CONSTRAINT fk_rails_81de23790d FOREIGN KEY (practice_id, reviewed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_workforce_kiosk_sessions fk_rails_8293e2694b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_sessions
    ADD CONSTRAINT fk_rails_8293e2694b FOREIGN KEY (practice_id, kiosk_enrollment_id) REFERENCES public.clinic_workforce_kiosk_enrollments(practice_id, id);


--
-- Name: clinic_scribe_sources fk_rails_82de260d1b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_sources
    ADD CONSTRAINT fk_rails_82de260d1b FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_lots fk_rails_838cdb3be4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_lots
    ADD CONSTRAINT fk_rails_838cdb3be4 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_telehealth_participants fk_rails_83a5d08d3d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_participants
    ADD CONSTRAINT fk_rails_83a5d08d3d FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_visits fk_rails_843617e407; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_843617e407 FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_workforce_shift_swap_requests fk_rails_845032cdc6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT fk_rails_845032cdc6 FOREIGN KEY (practice_id, requested_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_working_drafts fk_rails_84580ca508; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_working_drafts
    ADD CONSTRAINT fk_rails_84580ca508 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_visit_type_rules fk_rails_848c7a9995; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visit_type_rules
    ADD CONSTRAINT fk_rails_848c7a9995 FOREIGN KEY (practice_id, visit_type_id) REFERENCES public.clinic_visit_types(practice_id, id);


--
-- Name: clinic_telehealth_consents fk_rails_84b22f91bc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_consents
    ADD CONSTRAINT fk_rails_84b22f91bc FOREIGN KEY (practice_id, participant_id) REFERENCES public.clinic_telehealth_participants(practice_id, id);


--
-- Name: clinic_workforce_punches fk_rails_856438e140; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punches
    ADD CONSTRAINT fk_rails_856438e140 FOREIGN KEY (practice_id, punch_challenge_id) REFERENCES public.clinic_workforce_punch_challenges(practice_id, id);


--
-- Name: clinic_scribe_encounters fk_rails_85abf60436; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_encounters
    ADD CONSTRAINT fk_rails_85abf60436 FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: clinic_telehealth_join_grants fk_rails_864581cee5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_join_grants
    ADD CONSTRAINT fk_rails_864581cee5 FOREIGN KEY (practice_id, visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_workforce_availability_versions fk_rails_880acd5a76; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_availability_versions
    ADD CONSTRAINT fk_rails_880acd5a76 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_scribe_sources fk_rails_886cbb25b8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_sources
    ADD CONSTRAINT fk_rails_886cbb25b8 FOREIGN KEY (practice_id, telehealth_recording_id) REFERENCES public.clinic_scribe_recordings(practice_id, id);


--
-- Name: clinic_inventory_counts fk_rails_88b808adc3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT fk_rails_88b808adc3 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_897bf894bc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_897bf894bc FOREIGN KEY (practice_id, instruction_note_signature_id) REFERENCES public.clinic_encounter_note_signatures(practice_id, id);


--
-- Name: clinic_workforce_employment_sites fk_rails_8a047045fe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employment_sites
    ADD CONSTRAINT fk_rails_8a047045fe FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_adjustment_requests fk_rails_8a4510b23a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_adjustment_requests
    ADD CONSTRAINT fk_rails_8a4510b23a FOREIGN KEY (practice_id, timecard_version_id) REFERENCES public.clinic_workforce_timecard_versions(practice_id, id);


--
-- Name: clinic_inventory_receiving_sessions fk_rails_8cf45611bf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receiving_sessions
    ADD CONSTRAINT fk_rails_8cf45611bf FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_punches fk_rails_8d6810b0d1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punches
    ADD CONSTRAINT fk_rails_8d6810b0d1 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_schedule_publications fk_rails_8e60744ac0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_publications
    ADD CONSTRAINT fk_rails_8e60744ac0 FOREIGN KEY (practice_id, schedule_draft_id) REFERENCES public.clinic_workforce_schedule_drafts(practice_id, id);


--
-- Name: clinic_telehealth_checkins fk_rails_8ed3369c01; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_checkins
    ADD CONSTRAINT fk_rails_8ed3369c01 FOREIGN KEY (practice_id, participant_id) REFERENCES public.clinic_telehealth_participants(practice_id, id);


--
-- Name: clinic_inventory_shipment_lines fk_rails_8fc90ea7a2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines
    ADD CONSTRAINT fk_rails_8fc90ea7a2 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_90269df054; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_90269df054 FOREIGN KEY (practice_id, instruction_note_id) REFERENCES public.clinic_encounter_notes(practice_id, id);


--
-- Name: clinic_workforce_schedule_publications fk_rails_906779a65f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_publications
    ADD CONSTRAINT fk_rails_906779a65f FOREIGN KEY (practice_id, supersedes_id) REFERENCES public.clinic_workforce_schedule_publications(practice_id, id);


--
-- Name: clinic_patient_reminder_delivery_attempts fk_rails_9135d9755e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminder_delivery_attempts
    ADD CONSTRAINT fk_rails_9135d9755e FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_kiosk_enrollments fk_rails_9501614832; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_enrollments
    ADD CONSTRAINT fk_rails_9501614832 FOREIGN KEY (practice_id, issued_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_subscription_events fk_rails_96eb5b3858; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_events
    ADD CONSTRAINT fk_rails_96eb5b3858 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_cash_tenders fk_rails_9722709391; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders
    ADD CONSTRAINT fk_rails_9722709391 FOREIGN KEY (recorded_by_id) REFERENCES public.users(id);


--
-- Name: clinic_telehealth_visits fk_rails_97352d0542; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_97352d0542 FOREIGN KEY (practice_id, ended_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_patients fk_rails_97dd7e2d22; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patients
    ADD CONSTRAINT fk_rails_97dd7e2d22 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_visits fk_rails_985576644a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_985576644a FOREIGN KEY (practice_id, scribe_capture_owner_participant_id) REFERENCES public.clinic_telehealth_participants(practice_id, id);


--
-- Name: clinic_workforce_export_batches fk_rails_9890b6fffd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_export_batches
    ADD CONSTRAINT fk_rails_9890b6fffd FOREIGN KEY (practice_id, configuration_version_id) REFERENCES public.clinic_workforce_payroll_configuration_versions(practice_id, id);


--
-- Name: clinic_stripe_checkouts fk_rails_99067e40f4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_checkouts
    ADD CONSTRAINT fk_rails_99067e40f4 FOREIGN KEY (practice_id, collection_intent_id) REFERENCES public.clinic_payment_collection_intents(practice_id, id);


--
-- Name: clinic_workforce_adjustment_requests fk_rails_996f5f302c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_adjustment_requests
    ADD CONSTRAINT fk_rails_996f5f302c FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_shift_swap_requests fk_rails_99b1639b4b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT fk_rails_99b1639b4b FOREIGN KEY (practice_id, target_decided_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_stripe_membership_cycles fk_rails_99bcd47e94; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_membership_cycles
    ADD CONSTRAINT fk_rails_99bcd47e94 FOREIGN KEY (practice_id, checkout_id) REFERENCES public.clinic_stripe_checkouts(practice_id, id);


--
-- Name: clinic_inventory_purchase_cart_items fk_rails_9a2eaa91d6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_cart_items
    ADD CONSTRAINT fk_rails_9a2eaa91d6 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: member_sessions fk_rails_9aa185dc67; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_sessions
    ADD CONSTRAINT fk_rails_9aa185dc67 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_transfers fk_rails_9c2299c2ca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers
    ADD CONSTRAINT fk_rails_9c2299c2ca FOREIGN KEY (practice_id, destination_batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_inventory_purchase_cart_items fk_rails_9c8cf6563b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_cart_items
    ADD CONSTRAINT fk_rails_9c8cf6563b FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_catalog_events fk_rails_9cbaf2de55; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events
    ADD CONSTRAINT fk_rails_9cbaf2de55 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_workforce_shift_swap_requests fk_rails_9d13ceefeb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT fk_rails_9d13ceefeb FOREIGN KEY (practice_id, schedule_publication_id) REFERENCES public.clinic_workforce_schedule_publications(practice_id, id);


--
-- Name: clinic_scribe_events fk_rails_9d1b50e955; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_events
    ADD CONSTRAINT fk_rails_9d1b50e955 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_commands fk_rails_9d3628d4e2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_commands
    ADD CONSTRAINT fk_rails_9d3628d4e2 FOREIGN KEY (practice_id, participant_id) REFERENCES public.clinic_telehealth_participants(practice_id, id);


--
-- Name: clinic_workforce_availability_versions fk_rails_9f1c6209c8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_availability_versions
    ADD CONSTRAINT fk_rails_9f1c6209c8 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_telehealth_visit_type_rules fk_rails_a0ea7f99a7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visit_type_rules
    ADD CONSTRAINT fk_rails_a0ea7f99a7 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_workforce_export_batches fk_rails_a169ff1a35; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_export_batches
    ADD CONSTRAINT fk_rails_a169ff1a35 FOREIGN KEY (practice_id, supersedes_batch_id) REFERENCES public.clinic_workforce_export_batches(practice_id, id);


--
-- Name: clinic_workforce_employee_invitations fk_rails_a17da6a96d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employee_invitations
    ADD CONSTRAINT fk_rails_a17da6a96d FOREIGN KEY (role_version_id) REFERENCES public.role_versions(id);


--
-- Name: clinic_stock_movements fk_rails_a204b55367; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements
    ADD CONSTRAINT fk_rails_a204b55367 FOREIGN KEY (item_id) REFERENCES public.clinic_items(id);


--
-- Name: clinic_billing_services fk_rails_a2650ce446; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_services
    ADD CONSTRAINT fk_rails_a2650ce446 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_employment_sites fk_rails_a301c07935; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employment_sites
    ADD CONSTRAINT fk_rails_a301c07935 FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_pharmacy_batches fk_rails_a32323ffa1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches
    ADD CONSTRAINT fk_rails_a32323ffa1 FOREIGN KEY (practice_id, location_id) REFERENCES public.clinic_inventory_locations(practice_id, id);


--
-- Name: clinic_inventory_shipment_reconciliations fk_rails_a38c793051; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_reconciliations
    ADD CONSTRAINT fk_rails_a38c793051 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_workforce_schedule_publications fk_rails_a3a7b0c020; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_publications
    ADD CONSTRAINT fk_rails_a3a7b0c020 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_scribe_drafts fk_rails_a4a0a9b474; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts
    ADD CONSTRAINT fk_rails_a4a0a9b474 FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: clinic_telehealth_settings fk_rails_a4e7ddf6fe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_settings
    ADD CONSTRAINT fk_rails_a4e7ddf6fe FOREIGN KEY (practice_id, updated_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_shipment_lines fk_rails_a56c476f5d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines
    ADD CONSTRAINT fk_rails_a56c476f5d FOREIGN KEY (practice_id, shipment_id) REFERENCES public.clinic_inventory_shipments(practice_id, id);


--
-- Name: clinic_telehealth_policy_versions fk_rails_a5b9e703f8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_policy_versions
    ADD CONSTRAINT fk_rails_a5b9e703f8 FOREIGN KEY (practice_id, settings_id) REFERENCES public.clinic_telehealth_settings(practice_id, id);


--
-- Name: clinic_workforce_timecard_versions fk_rails_a5e7408b1a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_timecard_versions
    ADD CONSTRAINT fk_rails_a5e7408b1a FOREIGN KEY (practice_id, submitted_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_control_reviews fk_rails_a6543292ee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_control_reviews
    ADD CONSTRAINT fk_rails_a6543292ee FOREIGN KEY (practice_id, count_id) REFERENCES public.clinic_inventory_counts(practice_id, id);


--
-- Name: clinic_staff_members fk_rails_a6a2cb8cfb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_members
    ADD CONSTRAINT fk_rails_a6a2cb8cfb FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_stripe_checkouts fk_rails_a725a2de24; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stripe_checkouts
    ADD CONSTRAINT fk_rails_a725a2de24 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_supplier_products fk_rails_a7897acf61; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_products
    ADD CONSTRAINT fk_rails_a7897acf61 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_inventory_purchase_cart_items fk_rails_ab1336f6d5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_cart_items
    ADD CONSTRAINT fk_rails_ab1336f6d5 FOREIGN KEY (practice_id, selected_supplier_product_id) REFERENCES public.clinic_inventory_supplier_products(practice_id, id);


--
-- Name: clinic_inventory_suppliers fk_rails_ab28ffbe7b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_suppliers
    ADD CONSTRAINT fk_rails_ab28ffbe7b FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_punch_challenges fk_rails_ac6ecccd3e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_punch_challenges
    ADD CONSTRAINT fk_rails_ac6ecccd3e FOREIGN KEY (practice_id, kiosk_session_id) REFERENCES public.clinic_workforce_kiosk_sessions(practice_id, id);


--
-- Name: clinic_workforce_shift_swap_requests fk_rails_ac7d785f26; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT fk_rails_ac7d785f26 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_workforce_badge_credentials fk_rails_acada4d59c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_badge_credentials
    ADD CONSTRAINT fk_rails_acada4d59c FOREIGN KEY (practice_id, issued_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_receipt_lines fk_rails_ad6fb9b32c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipt_lines
    ADD CONSTRAINT fk_rails_ad6fb9b32c FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_inventory_holds fk_rails_af351b5454; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_af351b5454 FOREIGN KEY (recall_id) REFERENCES public.clinic_inventory_recalls(id);


--
-- Name: clinic_workforce_employment_sites fk_rails_b01eb37851; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employment_sites
    ADD CONSTRAINT fk_rails_b01eb37851 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_telehealth_visits fk_rails_b173f22f71; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_b173f22f71 FOREIGN KEY (practice_id, scribe_encounter_id) REFERENCES public.clinic_scribe_encounters(practice_id, id);


--
-- Name: clinic_telehealth_policy_versions fk_rails_b1ec9863ea; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_policy_versions
    ADD CONSTRAINT fk_rails_b1ec9863ea FOREIGN KEY (practice_id, created_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_telehealth_patient_receipts fk_rails_b26986da09; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_patient_receipts
    ADD CONSTRAINT fk_rails_b26986da09 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_consents fk_rails_b3a71c5a3b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_consents
    ADD CONSTRAINT fk_rails_b3a71c5a3b FOREIGN KEY (practice_id, supersedes_consent_id) REFERENCES public.clinic_telehealth_consents(practice_id, id);


--
-- Name: clinic_scribe_lab_selections fk_rails_b3dbff35c5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_lab_selections
    ADD CONSTRAINT fk_rails_b3dbff35c5 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_holds fk_rails_b490831fc1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_b490831fc1 FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_workforce_schedule_drafts fk_rails_b4b6665fbc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_drafts
    ADD CONSTRAINT fk_rails_b4b6665fbc FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_inventory_purchase_orders fk_rails_b720404725; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_orders
    ADD CONSTRAINT fk_rails_b720404725 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_vendor_returns fk_rails_b7deeb5ae6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_vendor_returns
    ADD CONSTRAINT fk_rails_b7deeb5ae6 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_schedule_templates fk_rails_b7fa0c013b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_templates
    ADD CONSTRAINT fk_rails_b7fa0c013b FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_inventory_entries fk_rails_b8cd22dd7c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_b8cd22dd7c FOREIGN KEY (practice_id, count_id) REFERENCES public.clinic_inventory_counts(practice_id, id);


--
-- Name: clinic_scribe_documents fk_rails_b8e12be982; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_documents
    ADD CONSTRAINT fk_rails_b8e12be982 FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_count_approvals fk_rails_b8e7132e3c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals
    ADD CONSTRAINT fk_rails_b8e7132e3c FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_scribe_recordings fk_rails_b91e10fcc5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recordings
    ADD CONSTRAINT fk_rails_b91e10fcc5 FOREIGN KEY (practice_id, telehealth_visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_scribe_events fk_rails_b9b5c0bce2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_events
    ADD CONSTRAINT fk_rails_b9b5c0bce2 FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: learning_progresses fk_rails_b9fd1490bb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_progresses
    ADD CONSTRAINT fk_rails_b9fd1490bb FOREIGN KEY (material_id) REFERENCES public.materials(id);


--
-- Name: clinic_telehealth_settings fk_rails_bb7e7d9d65; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_settings
    ADD CONSTRAINT fk_rails_bb7e7d9d65 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_participants fk_rails_bbaba425e6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_participants
    ADD CONSTRAINT fk_rails_bbaba425e6 FOREIGN KEY (practice_id, membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_scribe_recordings fk_rails_bbf15a4b44; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recordings
    ADD CONSTRAINT fk_rails_bbf15a4b44 FOREIGN KEY (practice_id, capture_owner_participant_id) REFERENCES public.clinic_telehealth_participants(practice_id, id);


--
-- Name: clinic_stock_movements fk_rails_bcd06826f5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements
    ADD CONSTRAINT fk_rails_bcd06826f5 FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_supplier_credits fk_rails_be18ebcf18; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_credits
    ADD CONSTRAINT fk_rails_be18ebcf18 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_telehealth_commands fk_rails_be7480538c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_commands
    ADD CONSTRAINT fk_rails_be7480538c FOREIGN KEY (practice_id, room_attempt_id) REFERENCES public.clinic_telehealth_room_attempts(practice_id, id);


--
-- Name: clinic_workforce_availability_versions fk_rails_bef7fafd4f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_availability_versions
    ADD CONSTRAINT fk_rails_bef7fafd4f FOREIGN KEY (practice_id, reviewed_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_receipts fk_rails_c34fa1ffdc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_c34fa1ffdc FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_kiosk_enrollments fk_rails_c366323e19; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_enrollments
    ADD CONSTRAINT fk_rails_c366323e19 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_scribe_drafts fk_rails_c5c7302aaf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts
    ADD CONSTRAINT fk_rails_c5c7302aaf FOREIGN KEY (approved_by_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_receipts fk_rails_c69b8d3b38; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_c69b8d3b38 FOREIGN KEY (practice_id, shipment_id) REFERENCES public.clinic_inventory_shipments(practice_id, id);


--
-- Name: clinic_inventory_shipment_lines fk_rails_c6b9d2d625; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines
    ADD CONSTRAINT fk_rails_c6b9d2d625 FOREIGN KEY (practice_id, purchase_order_line_id) REFERENCES public.clinic_inventory_purchase_order_lines(practice_id, id);


--
-- Name: clinic_workforce_kiosk_sessions fk_rails_c771adc280; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_kiosk_sessions
    ADD CONSTRAINT fk_rails_c771adc280 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_workforce_time_segments fk_rails_c94a0f99e0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_segments
    ADD CONSTRAINT fk_rails_c94a0f99e0 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_purchase_order_lines fk_rails_c984460d27; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_lines
    ADD CONSTRAINT fk_rails_c984460d27 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_entries fk_rails_cc415ce543; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_cc415ce543 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_availability_versions fk_rails_cda17f1998; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_availability_versions
    ADD CONSTRAINT fk_rails_cda17f1998 FOREIGN KEY (practice_id, employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_inventory_recall_dispositions fk_rails_cf064c4850; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_dispositions
    ADD CONSTRAINT fk_rails_cf064c4850 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_time_off_requests fk_rails_d03f705388; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_off_requests
    ADD CONSTRAINT fk_rails_d03f705388 FOREIGN KEY (practice_id, reviewed_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_export_batches fk_rails_d0ea41ca6b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_export_batches
    ADD CONSTRAINT fk_rails_d0ea41ca6b FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_working_drafts fk_rails_d107db7860; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_working_drafts
    ADD CONSTRAINT fk_rails_d107db7860 FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_inventory_receipts fk_rails_d151644211; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_d151644211 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_telehealth_checkins fk_rails_d17fcfc8c1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_checkins
    ADD CONSTRAINT fk_rails_d17fcfc8c1 FOREIGN KEY (practice_id, visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_workforce_payroll_configuration_versions fk_rails_d19cb84774; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_payroll_configuration_versions
    ADD CONSTRAINT fk_rails_d19cb84774 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_invoice_stripe_checkouts fk_rails_d2e48ecb43; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_stripe_checkouts
    ADD CONSTRAINT fk_rails_d2e48ecb43 FOREIGN KEY (practice_id, connection_id) REFERENCES public.clinic_stripe_connections(practice_id, id);


--
-- Name: clinic_workforce_timecard_versions fk_rails_d50ec95377; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_timecard_versions
    ADD CONSTRAINT fk_rails_d50ec95377 FOREIGN KEY (practice_id, previous_version_id) REFERENCES public.clinic_workforce_timecard_versions(practice_id, id);


--
-- Name: clinic_inventory_hold_releases fk_rails_d534f66a0c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases
    ADD CONSTRAINT fk_rails_d534f66a0c FOREIGN KEY (practice_id, hold_id) REFERENCES public.clinic_inventory_holds(practice_id, id);


--
-- Name: clinic_inventory_entries fk_rails_d747a2ebfc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_d747a2ebfc FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_pharmacy_batches fk_rails_d749b21c59; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches
    ADD CONSTRAINT fk_rails_d749b21c59 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_holds fk_rails_d7b0ced0a5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_d7b0ced0a5 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_schedule_drafts fk_rails_d8046d4b71; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_schedule_drafts
    ADD CONSTRAINT fk_rails_d8046d4b71 FOREIGN KEY (practice_id, schedule_template_id) REFERENCES public.clinic_workforce_schedule_templates(practice_id, id);


--
-- Name: clinic_subscription_agreements fk_rails_d80b6a2e93; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_agreements
    ADD CONSTRAINT fk_rails_d80b6a2e93 FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_d8aeb013b0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_d8aeb013b0 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_encounter_follow_ups fk_rails_d8d4d99e52; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_encounter_follow_ups
    ADD CONSTRAINT fk_rails_d8d4d99e52 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_purchase_orders fk_rails_d9e8cb8ec2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_orders
    ADD CONSTRAINT fk_rails_d9e8cb8ec2 FOREIGN KEY (practice_id, purchase_cart_id) REFERENCES public.clinic_inventory_purchase_carts(practice_id, id);


--
-- Name: clinic_telehealth_visit_type_rules fk_rails_da83a8fd34; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visit_type_rules
    ADD CONSTRAINT fk_rails_da83a8fd34 FOREIGN KEY (practice_id, updated_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_memberships fk_rails_dad9512d92; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_memberships
    ADD CONSTRAINT fk_rails_dad9512d92 FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: clinic_pharmacy_products fk_rails_db1a875745; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_products
    ADD CONSTRAINT fk_rails_db1a875745 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_shifts fk_rails_dcb1b35bbb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shifts
    ADD CONSTRAINT fk_rails_dcb1b35bbb FOREIGN KEY (practice_id, schedule_draft_id) REFERENCES public.clinic_workforce_schedule_drafts(practice_id, id);


--
-- Name: clinic_inventory_recalls fk_rails_dccd1e6686; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recalls
    ADD CONSTRAINT fk_rails_dccd1e6686 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_defea0f536; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_defea0f536 FOREIGN KEY (practice_id, updated_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_supplier_credits fk_rails_df09b50840; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_credits
    ADD CONSTRAINT fk_rails_df09b50840 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_workforce_adjustment_requests fk_rails_df65e14823; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_adjustment_requests
    ADD CONSTRAINT fk_rails_df65e14823 FOREIGN KEY (practice_id, resulting_timecard_version_id) REFERENCES public.clinic_workforce_timecard_versions(practice_id, id);


--
-- Name: clinic_telehealth_provider_events fk_rails_e032280499; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_provider_events
    ADD CONSTRAINT fk_rails_e032280499 FOREIGN KEY (practice_id, room_attempt_id) REFERENCES public.clinic_telehealth_room_attempts(practice_id, id);


--
-- Name: clinic_inventory_receipts fk_rails_e0cba62533; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_e0cba62533 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_workforce_employee_invitations fk_rails_e1122d2ea4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employee_invitations
    ADD CONSTRAINT fk_rails_e1122d2ea4 FOREIGN KEY (practice_id, invited_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_workforce_badge_credentials fk_rails_e1be38af55; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_badge_credentials
    ADD CONSTRAINT fk_rails_e1be38af55 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_e2f0e5598d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_e2f0e5598d FOREIGN KEY (practice_id, scribe_export_id) REFERENCES public.clinic_scribe_exports(practice_id, id);


--
-- Name: clinic_workforce_employments fk_rails_e30d82058e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employments
    ADD CONSTRAINT fk_rails_e30d82058e FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_vendor_returns fk_rails_e3170a0b16; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_vendor_returns
    ADD CONSTRAINT fk_rails_e3170a0b16 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_subscription_agreements fk_rails_e3a732c444; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_agreements
    ADD CONSTRAINT fk_rails_e3a732c444 FOREIGN KEY (practice_id, version_id) REFERENCES public.clinic_subscription_versions(practice_id, id);


--
-- Name: clinic_inventory_counts fk_rails_e3e20ad7be; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT fk_rails_e3e20ad7be FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_telehealth_visits fk_rails_e59fdfa9b1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_e59fdfa9b1 FOREIGN KEY (practice_id, policy_version_id) REFERENCES public.clinic_telehealth_policy_versions(practice_id, id);


--
-- Name: clinic_inventory_count_approvals fk_rails_e61d4862fb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals
    ADD CONSTRAINT fk_rails_e61d4862fb FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_scribe_recordings fk_rails_e6b7ab814d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recordings
    ADD CONSTRAINT fk_rails_e6b7ab814d FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_notes fk_rails_e6def732a1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes
    ADD CONSTRAINT fk_rails_e6def732a1 FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_inventory_catalog_events fk_rails_e867bf0ce9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events
    ADD CONSTRAINT fk_rails_e867bf0ce9 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_inventory_receipt_lines fk_rails_e879d9b8a1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipt_lines
    ADD CONSTRAINT fk_rails_e879d9b8a1 FOREIGN KEY (practice_id, purchase_order_line_id) REFERENCES public.clinic_inventory_purchase_order_lines(practice_id, id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_e922425fc5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_e922425fc5 FOREIGN KEY (practice_id, instruction_note_revision_id) REFERENCES public.clinic_encounter_note_revisions(practice_id, id);


--
-- Name: clinic_invoice_stripe_checkouts fk_rails_e999cfba54; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_stripe_checkouts
    ADD CONSTRAINT fk_rails_e999cfba54 FOREIGN KEY (practice_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_e9e2e652e2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_e9e2e652e2 FOREIGN KEY (practice_id, visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_telehealth_visits fk_rails_edb4dbf576; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_visits
    ADD CONSTRAINT fk_rails_edb4dbf576 FOREIGN KEY (practice_id, current_room_attempt_id) REFERENCES public.clinic_telehealth_room_attempts(practice_id, id);


--
-- Name: clinic_inventory_shipments fk_rails_edc1f124e2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipments
    ADD CONSTRAINT fk_rails_edc1f124e2 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_workforce_employments fk_rails_ede8fb32d3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_employments
    ADD CONSTRAINT fk_rails_ede8fb32d3 FOREIGN KEY (practice_id, staff_member_id) REFERENCES public.clinic_staff_members(practice_id, id);


--
-- Name: clinic_telehealth_participants fk_rails_edfdd0766b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_participants
    ADD CONSTRAINT fk_rails_edfdd0766b FOREIGN KEY (practice_id, admitted_checkin_id) REFERENCES public.clinic_telehealth_checkins(practice_id, id);


--
-- Name: clinic_workforce_shifts fk_rails_eeb20d59e1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shifts
    ADD CONSTRAINT fk_rails_eeb20d59e1 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_policy_versions fk_rails_eedb041db9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_policy_versions
    ADD CONSTRAINT fk_rails_eedb041db9 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_entries fk_rails_efa7833c43; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_efa7833c43 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_subscription_families fk_rails_efc2999f57; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_families
    ADD CONSTRAINT fk_rails_efc2999f57 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_patient_receipts fk_rails_f0444651a5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_patient_receipts
    ADD CONSTRAINT fk_rails_f0444651a5 FOREIGN KEY (practice_id, visit_id) REFERENCES public.clinic_telehealth_visits(practice_id, id);


--
-- Name: clinic_inventory_purchase_order_events fk_rails_f18a5bb017; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_events
    ADD CONSTRAINT fk_rails_f18a5bb017 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_inventory_entries fk_rails_f24eebfb52; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_f24eebfb52 FOREIGN KEY (recall_disposition_id) REFERENCES public.clinic_inventory_recall_dispositions(id);


--
-- Name: clinic_inventory_purchase_order_lines fk_rails_f2d2576329; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_lines
    ADD CONSTRAINT fk_rails_f2d2576329 FOREIGN KEY (practice_id, cart_item_id) REFERENCES public.clinic_inventory_purchase_cart_items(practice_id, id);


--
-- Name: clinic_pharmacy_batches fk_rails_f379e7d3d0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches
    ADD CONSTRAINT fk_rails_f379e7d3d0 FOREIGN KEY (practice_id, lot_id) REFERENCES public.clinic_inventory_lots(practice_id, id);


--
-- Name: clinic_inventory_supplier_invoices fk_rails_f43abf3317; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_supplier_invoices
    ADD CONSTRAINT fk_rails_f43abf3317 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_scribe_recording_chunks fk_rails_f490485c3d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recording_chunks
    ADD CONSTRAINT fk_rails_f490485c3d FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_timecard_versions fk_rails_f4a8d0e896; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_timecard_versions
    ADD CONSTRAINT fk_rails_f4a8d0e896 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_notes fk_rails_f59202edf5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes
    ADD CONSTRAINT fk_rails_f59202edf5 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_cash_drawer_sessions fk_rails_f5b4fda74e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions
    ADD CONSTRAINT fk_rails_f5b4fda74e FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_wrap_ups fk_rails_f753ac1438; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_rails_f753ac1438 FOREIGN KEY (practice_id, finalized_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_patient_reminders fk_rails_f912e04043; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_reminders
    ADD CONSTRAINT fk_rails_f912e04043 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_count_approvals fk_rails_f9afbba88d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals
    ADD CONSTRAINT fk_rails_f9afbba88d FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_hold_releases fk_rails_fac1019ef5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases
    ADD CONSTRAINT fk_rails_fac1019ef5 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_receipt_lines fk_rails_fb4a1e828c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipt_lines
    ADD CONSTRAINT fk_rails_fb4a1e828c FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_lots fk_rails_fba4dc453c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_lots
    ADD CONSTRAINT fk_rails_fba4dc453c FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_telehealth_room_attempts fk_rails_fc1939a661; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_room_attempts
    ADD CONSTRAINT fk_rails_fc1939a661 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_recalls fk_rails_fc73ce6297; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recalls
    ADD CONSTRAINT fk_rails_fc73ce6297 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_workforce_time_off_requests fk_rails_fc8e68da48; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_off_requests
    ADD CONSTRAINT fk_rails_fc8e68da48 FOREIGN KEY (practice_id, requested_by_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_recall_lots fk_rails_fd3cd35ef9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_lots
    ADD CONSTRAINT fk_rails_fd3cd35ef9 FOREIGN KEY (practice_id, recall_id) REFERENCES public.clinic_inventory_recalls(practice_id, id);


--
-- Name: clinic_inventory_recall_dispositions fk_rails_fd5e2da0db; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_dispositions
    ADD CONSTRAINT fk_rails_fd5e2da0db FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_workforce_time_off_requests fk_rails_fd9725aff5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_time_off_requests
    ADD CONSTRAINT fk_rails_fd9725aff5 FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_refund_events fk_refund_events_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_refund_events
    ADD CONSTRAINT fk_refund_events_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_refund_events fk_refund_events_payment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_refund_events
    ADD CONSTRAINT fk_refund_events_payment FOREIGN KEY (practice_id, patient_id, payment_event_id) REFERENCES public.clinic_payment_events(practice_id, patient_id, id);


--
-- Name: clinic_role_grant_events fk_role_grant_events_grant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grant_events
    ADD CONSTRAINT fk_role_grant_events_grant FOREIGN KEY (practice_id, grant_id) REFERENCES public.clinic_role_grants(practice_id, id);


--
-- Name: clinic_role_grant_events fk_role_grant_events_grantor; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grant_events
    ADD CONSTRAINT fk_role_grant_events_grantor FOREIGN KEY (practice_id, grantor_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_role_grants fk_role_grants_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grants
    ADD CONSTRAINT fk_role_grants_membership FOREIGN KEY (practice_id, membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_role_grants fk_role_grants_role_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grants
    ADD CONSTRAINT fk_role_grants_role_version FOREIGN KEY (role_version_id) REFERENCES public.role_versions(id);


--
-- Name: clinic_role_grants fk_role_grants_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_role_grants
    ADD CONSTRAINT fk_role_grants_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: role_version_permissions fk_role_version_permissions_permission; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_version_permissions
    ADD CONSTRAINT fk_role_version_permissions_permission FOREIGN KEY (permission_id) REFERENCES public.permissions(id);


--
-- Name: role_version_permissions fk_role_version_permissions_role; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_version_permissions
    ADD CONSTRAINT fk_role_version_permissions_role FOREIGN KEY (role_version_id) REFERENCES public.role_versions(id);


--
-- Name: clinic_rooms fk_rooms_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_rooms
    ADD CONSTRAINT fk_rooms_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_scribe_documents fk_scribe_documents_current_draft; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_documents
    ADD CONSTRAINT fk_scribe_documents_current_draft FOREIGN KEY (practice_id, id, current_draft_id) REFERENCES public.clinic_scribe_drafts(practice_id, document_id, id);


--
-- Name: clinic_scribe_documents fk_scribe_documents_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_documents
    ADD CONSTRAINT fk_scribe_documents_encounter FOREIGN KEY (practice_id, encounter_id) REFERENCES public.clinic_scribe_encounters(practice_id, id);


--
-- Name: clinic_scribe_drafts fk_scribe_drafts_document; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts
    ADD CONSTRAINT fk_scribe_drafts_document FOREIGN KEY (practice_id, encounter_id, document_id) REFERENCES public.clinic_scribe_documents(practice_id, encounter_id, id);


--
-- Name: clinic_scribe_drafts fk_scribe_drafts_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts
    ADD CONSTRAINT fk_scribe_drafts_encounter FOREIGN KEY (practice_id, encounter_id) REFERENCES public.clinic_scribe_encounters(practice_id, id);


--
-- Name: clinic_scribe_drafts fk_scribe_drafts_parent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts
    ADD CONSTRAINT fk_scribe_drafts_parent FOREIGN KEY (practice_id, parent_id) REFERENCES public.clinic_scribe_drafts(practice_id, id);


--
-- Name: clinic_scribe_drafts fk_scribe_drafts_source; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_drafts
    ADD CONSTRAINT fk_scribe_drafts_source FOREIGN KEY (practice_id, source_id) REFERENCES public.clinic_scribe_sources(practice_id, id);


--
-- Name: clinic_scribe_encounters fk_scribe_encounters_clinical_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_encounters
    ADD CONSTRAINT fk_scribe_encounters_clinical_encounter FOREIGN KEY (practice_id, patient_id, clinical_encounter_id) REFERENCES public.clinic_encounters(practice_id, patient_id, id);


--
-- Name: clinic_scribe_encounters fk_scribe_encounters_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_encounters
    ADD CONSTRAINT fk_scribe_encounters_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_scribe_encounters fk_scribe_encounters_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_encounters
    ADD CONSTRAINT fk_scribe_encounters_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_scribe_events fk_scribe_events_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_events
    ADD CONSTRAINT fk_scribe_events_encounter FOREIGN KEY (practice_id, encounter_id) REFERENCES public.clinic_scribe_encounters(practice_id, id);


--
-- Name: clinic_scribe_exports fk_scribe_exports_draft; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_exports
    ADD CONSTRAINT fk_scribe_exports_draft FOREIGN KEY (practice_id, draft_id) REFERENCES public.clinic_scribe_drafts(practice_id, id);


--
-- Name: clinic_scribe_exports fk_scribe_exports_encounter_note; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_exports
    ADD CONSTRAINT fk_scribe_exports_encounter_note FOREIGN KEY (practice_id, encounter_note_id) REFERENCES public.clinic_encounter_notes(practice_id, id);


--
-- Name: clinic_scribe_exports fk_scribe_exports_encounter_note_revision; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_exports
    ADD CONSTRAINT fk_scribe_exports_encounter_note_revision FOREIGN KEY (practice_id, encounter_note_id, encounter_note_revision_id) REFERENCES public.clinic_encounter_note_revisions(practice_id, note_id, id);


--
-- Name: clinic_scribe_lab_selections fk_scribe_lab_selections_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_lab_selections
    ADD CONSTRAINT fk_scribe_lab_selections_encounter FOREIGN KEY (practice_id, patient_id, encounter_id) REFERENCES public.clinic_scribe_encounters(practice_id, patient_id, id);


--
-- Name: clinic_scribe_lab_selections fk_scribe_lab_selections_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_lab_selections
    ADD CONSTRAINT fk_scribe_lab_selections_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


--
-- Name: clinic_scribe_lab_selections fk_scribe_lab_selections_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_lab_selections
    ADD CONSTRAINT fk_scribe_lab_selections_version FOREIGN KEY (practice_id, patient_id, lab_report_version_id) REFERENCES public.clinic_lab_report_versions(practice_id, patient_id, id);


--
-- Name: clinic_scribe_recording_chunks fk_scribe_recording_chunks_recording; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recording_chunks
    ADD CONSTRAINT fk_scribe_recording_chunks_recording FOREIGN KEY (practice_id, recording_id) REFERENCES public.clinic_scribe_recordings(practice_id, id);


--
-- Name: clinic_scribe_recordings fk_scribe_recordings_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_recordings
    ADD CONSTRAINT fk_scribe_recordings_encounter FOREIGN KEY (practice_id, encounter_id) REFERENCES public.clinic_scribe_encounters(practice_id, id);


--
-- Name: clinic_scribe_draft_sections fk_scribe_sections_draft; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_draft_sections
    ADD CONSTRAINT fk_scribe_sections_draft FOREIGN KEY (practice_id, draft_id) REFERENCES public.clinic_scribe_drafts(practice_id, id);


--
-- Name: clinic_scribe_source_segments fk_scribe_segments_source; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_source_segments
    ADD CONSTRAINT fk_scribe_segments_source FOREIGN KEY (practice_id, source_id) REFERENCES public.clinic_scribe_sources(practice_id, id);


--
-- Name: clinic_scribe_sources fk_scribe_sources_encounter; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_scribe_sources
    ADD CONSTRAINT fk_scribe_sources_encounter FOREIGN KEY (practice_id, encounter_id) REFERENCES public.clinic_scribe_encounters(practice_id, id);


--
-- Name: clinic_staff_address_versions fk_staff_addresses_staff; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_address_versions
    ADD CONSTRAINT fk_staff_addresses_staff FOREIGN KEY (practice_id, staff_member_id) REFERENCES public.clinic_staff_members(practice_id, id);


--
-- Name: clinic_staff_conversation_members fk_staff_conversation_members_conversation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversation_members
    ADD CONSTRAINT fk_staff_conversation_members_conversation FOREIGN KEY (practice_id, conversation_id) REFERENCES public.clinic_staff_conversations(practice_id, id);


--
-- Name: clinic_staff_conversation_members fk_staff_conversation_members_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversation_members
    ADD CONSTRAINT fk_staff_conversation_members_membership FOREIGN KEY (practice_id, membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_conversation_members fk_staff_conversation_members_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversation_members
    ADD CONSTRAINT fk_staff_conversation_members_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_conversation_members fk_staff_conversation_members_remover; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversation_members
    ADD CONSTRAINT fk_staff_conversation_members_remover FOREIGN KEY (practice_id, removed_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_conversations fk_staff_conversations_creator; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversations
    ADD CONSTRAINT fk_staff_conversations_creator FOREIGN KEY (practice_id, created_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_conversations fk_staff_conversations_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversations
    ADD CONSTRAINT fk_staff_conversations_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_conversations fk_staff_conversations_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_conversations
    ADD CONSTRAINT fk_staff_conversations_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


--
-- Name: clinic_staff_message_attachments fk_staff_message_attachments_creator; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_attachments
    ADD CONSTRAINT fk_staff_message_attachments_creator FOREIGN KEY (practice_id, created_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_message_attachments fk_staff_message_attachments_message; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_attachments
    ADD CONSTRAINT fk_staff_message_attachments_message FOREIGN KEY (practice_id, message_id) REFERENCES public.clinic_staff_messages(practice_id, id);


--
-- Name: clinic_staff_message_attachments fk_staff_message_attachments_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_attachments
    ADD CONSTRAINT fk_staff_message_attachments_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_message_escalations fk_staff_message_escalations_message; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_escalations
    ADD CONSTRAINT fk_staff_message_escalations_message FOREIGN KEY (practice_id, message_id) REFERENCES public.clinic_staff_messages(practice_id, id);


--
-- Name: clinic_staff_message_escalations fk_staff_message_escalations_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_escalations
    ADD CONSTRAINT fk_staff_message_escalations_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_message_escalations fk_staff_message_escalations_request; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_escalations
    ADD CONSTRAINT fk_staff_message_escalations_request FOREIGN KEY (practice_id, request_id) REFERENCES public.clinic_staff_message_requests(practice_id, id);


--
-- Name: clinic_staff_message_escalations fk_staff_message_escalations_target; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_escalations
    ADD CONSTRAINT fk_staff_message_escalations_target FOREIGN KEY (practice_id, target_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_message_outbox fk_staff_message_outbox_message; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_outbox
    ADD CONSTRAINT fk_staff_message_outbox_message FOREIGN KEY (practice_id, message_id) REFERENCES public.clinic_staff_messages(practice_id, id);


--
-- Name: clinic_staff_message_outbox fk_staff_message_outbox_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_outbox
    ADD CONSTRAINT fk_staff_message_outbox_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_message_receipts fk_staff_message_receipts_message; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_receipts
    ADD CONSTRAINT fk_staff_message_receipts_message FOREIGN KEY (practice_id, message_id) REFERENCES public.clinic_staff_messages(practice_id, id);


--
-- Name: clinic_staff_message_receipts fk_staff_message_receipts_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_receipts
    ADD CONSTRAINT fk_staff_message_receipts_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_message_receipts fk_staff_message_receipts_recipient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_receipts
    ADD CONSTRAINT fk_staff_message_receipts_recipient FOREIGN KEY (practice_id, recipient_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_message_requests fk_staff_message_requests_assignee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_requests
    ADD CONSTRAINT fk_staff_message_requests_assignee FOREIGN KEY (practice_id, assignee_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_message_requests fk_staff_message_requests_message; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_requests
    ADD CONSTRAINT fk_staff_message_requests_message FOREIGN KEY (practice_id, message_id) REFERENCES public.clinic_staff_messages(practice_id, id);


--
-- Name: clinic_staff_message_requests fk_staff_message_requests_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_message_requests
    ADD CONSTRAINT fk_staff_message_requests_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_messages fk_staff_messages_acknowledger; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_messages
    ADD CONSTRAINT fk_staff_messages_acknowledger FOREIGN KEY (practice_id, acknowledged_by_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_messages fk_staff_messages_conversation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_messages
    ADD CONSTRAINT fk_staff_messages_conversation FOREIGN KEY (practice_id, conversation_id) REFERENCES public.clinic_staff_conversations(practice_id, id);


--
-- Name: clinic_staff_messages fk_staff_messages_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_messages
    ADD CONSTRAINT fk_staff_messages_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_messages fk_staff_messages_reply; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_messages
    ADD CONSTRAINT fk_staff_messages_reply FOREIGN KEY (practice_id, reply_to_message_id) REFERENCES public.clinic_staff_messages(practice_id, id);


--
-- Name: clinic_staff_messages fk_staff_messages_sender; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_messages
    ADD CONSTRAINT fk_staff_messages_sender FOREIGN KEY (practice_id, sender_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_notification_preferences fk_staff_notification_preferences_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notification_preferences
    ADD CONSTRAINT fk_staff_notification_preferences_membership FOREIGN KEY (practice_id, membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_notification_preferences fk_staff_notification_preferences_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notification_preferences
    ADD CONSTRAINT fk_staff_notification_preferences_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_notifications fk_staff_notifications_conversation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notifications
    ADD CONSTRAINT fk_staff_notifications_conversation FOREIGN KEY (practice_id, conversation_id) REFERENCES public.clinic_staff_conversations(practice_id, id);


--
-- Name: clinic_staff_notifications fk_staff_notifications_message; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notifications
    ADD CONSTRAINT fk_staff_notifications_message FOREIGN KEY (practice_id, message_id) REFERENCES public.clinic_staff_messages(practice_id, id);


--
-- Name: clinic_staff_notifications fk_staff_notifications_practice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notifications
    ADD CONSTRAINT fk_staff_notifications_practice FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_staff_notifications fk_staff_notifications_recipient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_notifications
    ADD CONSTRAINT fk_staff_notifications_recipient FOREIGN KEY (practice_id, recipient_membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_staff_members fk_staff_primary_address; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_members
    ADD CONSTRAINT fk_staff_primary_address FOREIGN KEY (practice_id, id, primary_address_version_id) REFERENCES public.clinic_staff_address_versions(practice_id, staff_member_id, id);


--
-- Name: clinic_supplier_address_versions fk_supplier_addresses_supplier; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_supplier_address_versions
    ADD CONSTRAINT fk_supplier_addresses_supplier FOREIGN KEY (practice_id, supplier_id) REFERENCES public.clinic_inventory_suppliers(practice_id, id);


--
-- Name: clinic_inventory_suppliers fk_suppliers_primary_address; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_suppliers
    ADD CONSTRAINT fk_suppliers_primary_address FOREIGN KEY (practice_id, id, primary_address_version_id) REFERENCES public.clinic_supplier_address_versions(practice_id, supplier_id, id);


--
-- Name: clinic_telehealth_wrap_ups fk_telehealth_wrap_ups_follow_up_appointment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_telehealth_wrap_ups_follow_up_appointment FOREIGN KEY (practice_id, patient_id, follow_up_appointment_id) REFERENCES public.clinic_appointments(practice_id, patient_id, id);


--
-- Name: clinic_telehealth_wrap_ups fk_telehealth_wrap_ups_scribe_note; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_telehealth_wrap_ups_scribe_note FOREIGN KEY (practice_id, scribe_encounter_note_id) REFERENCES public.clinic_encounter_notes(practice_id, id);


--
-- Name: clinic_telehealth_wrap_ups fk_telehealth_wrap_ups_scribe_revision; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_telehealth_wrap_ups
    ADD CONSTRAINT fk_telehealth_wrap_ups_scribe_revision FOREIGN KEY (practice_id, scribe_encounter_note_revision_id) REFERENCES public.clinic_encounter_note_revisions(practice_id, id);


--
-- Name: clinic_workforce_shift_swap_requests fk_workforce_swap_requester; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT fk_workforce_swap_requester FOREIGN KEY (practice_id, requester_employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_workforce_shift_swap_requests fk_workforce_swap_target; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_workforce_shift_swap_requests
    ADD CONSTRAINT fk_workforce_swap_target FOREIGN KEY (practice_id, target_employment_id) REFERENCES public.clinic_workforce_employments(practice_id, id);


--
-- Name: clinic_subscription_agreements subscription_agreement_invoice; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_agreements
    ADD CONSTRAINT subscription_agreement_invoice FOREIGN KEY (practice_id, patient_id, invoice_id) REFERENCES public.clinic_invoices(practice_id, patient_id, id);


--
-- Name: clinic_subscription_packages subscription_current_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_subscription_packages
    ADD CONSTRAINT subscription_current_version FOREIGN KEY (practice_id, id, published_version_id) REFERENCES public.clinic_subscription_versions(practice_id, package_id, id);


--
-- PostgreSQL database dump complete
--

SET search_path TO "$user", public;

INSERT INTO "schema_migrations" (version) VALUES
('20260909004100'),
('20260909004000'),
('20260909003000'),
('20260909002000'),
('20260909001000'),
('20260908230000'),
('20260908220000'),
('20260908210000'),
('20260908001000'),
('20260908000100'),
('20260907001000'),
('20260907000900'),
('20260907000800'),
('20260907000700'),
('20260907000600'),
('20260907000530'),
('20260907000520'),
('20260907000510'),
('20260907000500'),
('20260907000410'),
('20260907000400'),
('20260907000300'),
('20260907000200'),
('20260907000100'),
('20260906001900'),
('20260906001800'),
('20260906001720'),
('20260906001710'),
('20260906001700'),
('20260906001600'),
('20260906001500'),
('20260906001400'),
('20260906001300'),
('20260906001200'),
('20260906001100'),
('20260906001000'),
('20260906000500'),
('20260906000400'),
('20260906000300'),
('20260906000200'),
('20260906000100'),
('20260905010500'),
('20260905010400'),
('20260905010300'),
('20260905010200'),
('20260905010100'),
('20260905010000'),
('20260905000300'),
('20260905000200'),
('20260905000100'),
('20260904000600'),
('20260904000500'),
('20260904000400'),
('20260904000300'),
('20260904000200'),
('20260904000100'),
('20260903001400'),
('20260903001300'),
('20260903001230'),
('20260903001220'),
('20260903001210'),
('20260903001100'),
('20260903001000'),
('20260903000900'),
('20260903000800'),
('20260903000700'),
('20260903000600'),
('20260903000500'),
('20260903000400'),
('20260903000300'),
('20260903000200'),
('20260903000100'),
('20260902010000'),
('20260902009903'),
('20260902009902'),
('20260902009901'),
('20260902009900'),
('20260902002800'),
('20260902002700'),
('20260902002600'),
('20260902002500'),
('20260902002400'),
('20260902002300'),
('20260902002200'),
('20260902002100'),
('20260902002000'),
('20260902001800'),
('20260902001700'),
('20260902001600'),
('20260902001500'),
('20260902001400'),
('20260902001300'),
('20260902001200'),
('20260902001100'),
('20260902001000'),
('20260902000900'),
('20260902000800'),
('20260902000500'),
('20260902000400'),
('20260902000300'),
('20260902000200'),
('20260902000100'),
('20260901000200'),
('20260901000100'),
('20260831001100'),
('20260831001000'),
('20260831000900'),
('20260831000800'),
('20260831000700'),
('20260831000400'),
('20260831000300'),
('20260831000200'),
('20260831000100'),
('20260830000800'),
('20260830000700'),
('20260830000600'),
('20260830000500'),
('20260830000400'),
('20260830000300'),
('20260830000200'),
('20260830000100');

