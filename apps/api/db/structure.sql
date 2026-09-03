--
-- PostgreSQL database dump
--

\restrict 5OQdrEcgd10hUx4TZU9jGhAFAsuSS9pRMfkhfsymXallHJprqIOXPpsIjcCSRlV

-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6 (Debian 18.6-1.pgdg13+2)

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
  IF action <> 'configure' AND (configuration.id IS NULL OR configuration.status <> 'synthetic' OR NOT ('inventory' = ANY(configuration.capabilities)) OR (profile IS NOT NULL AND profile <> configuration.id)) THEN
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
-- Name: inventory_immutable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN RAISE EXCEPTION 'Inventory history is append-only'; END $$;


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
-- Name: inventory_receipt_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_receipt_check() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE product clinic_pharmacy_products%ROWTYPE;
BEGIN
  SELECT p.* INTO product FROM clinic_pharmacy_products p JOIN clinic_pharmacy_batches b ON b.product_id=p.id WHERE b.id=NEW.batch_id;
  IF NEW.stock_unit<>product.stock_unit OR NEW.quantity<>round(NEW.quantity,product.quantity_scale) OR NOT ((NEW.input_unit='package' AND NEW.conversion_factor=product.package_size AND NEW.input_quantity=round(NEW.input_quantity,0)) OR (NEW.input_unit=product.stock_unit AND NEW.conversion_factor=1 AND NEW.input_quantity=round(NEW.input_quantity,product.quantity_scale))) THEN RAISE EXCEPTION 'Receipt conversion does not match verified product units'; END IF;
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
    CONSTRAINT clinic_appointments_room_requires_site CHECK (((room_id IS NULL) OR (site_id IS NOT NULL))),
    CONSTRAINT clinic_appointments_status_present CHECK ((length(TRIM(BOTH FROM status)) > 0)),
    CONSTRAINT clinic_appointments_valid_time_range CHECK ((ends_at > starts_at))
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
    CONSTRAINT billing_receipt_kind CHECK (((kind)::text = ANY ((ARRAY['cash_payment'::character varying, 'cash_refund'::character varying])::text[])))
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
    request_key character varying DEFAULT ''::character varying NOT NULL,
    CONSTRAINT cash_tender_amounts CHECK (((tendered_amount > (0)::numeric) AND (change_amount >= (0)::numeric) AND (change_amount < tendered_amount))),
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
    CONSTRAINT inventory_count_values CHECK (((expected_quantity >= (0)::numeric) AND (expected_quantity <= (1000000)::numeric) AND ((observed_quantity >= (0)::numeric) AND (observed_quantity <= (1000000)::numeric)) AND (observed_quantity = round(observed_quantity, 6))))
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
    CONSTRAINT inventory_entry_direction CHECK (((((kind)::text = ANY (ARRAY[('receipt'::character varying)::text, ('adjustment_in'::character varying)::text])) AND (quantity > (0)::numeric)) OR (((kind)::text = ANY (ARRAY[('adjustment_out'::character varying)::text, ('damaged'::character varying)::text, ('expired'::character varying)::text, ('return_to_supplier'::character varying)::text])) AND (quantity < (0)::numeric)) OR ((kind)::text = ANY (ARRAY[('office_adjustment'::character varying)::text, ('count_correction'::character varying)::text, ('opening_balance'::character varying)::text])))),
    CONSTRAINT inventory_entry_provenance CHECK ((((origin)::text = ANY (ARRAY[('posted'::character varying)::text, ('legacy_movement'::character varying)::text, ('legacy_opening_balance'::character varying)::text])) AND ((actor_id IS NOT NULL) OR ((origin)::text = 'legacy_opening_balance'::text)) AND (((origin)::text <> 'posted'::text) OR (profile_id IS NOT NULL)))),
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
    CONSTRAINT inventory_hold_reason CHECK ((((kind)::text = ANY (ARRAY[('quarantined'::character varying)::text, ('recalled'::character varying)::text, ('temperature'::character varying)::text, ('damaged'::character varying)::text])) AND ((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 200))))
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
    CONSTRAINT inventory_location_kind CHECK (((kind)::text = ANY ((ARRAY['storage'::character varying, 'quarantine'::character varying, 'returns'::character varying, 'controlled'::character varying])::text[])))
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
    CONSTRAINT inventory_expiry_precision CHECK (((expiry_precision)::text = ANY (ARRAY[('day'::character varying)::text, ('month'::character varying)::text])))
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
    CONSTRAINT inventory_profile_scope CHECK (((version > 0) AND ((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('synthetic'::character varying)::text, ('suspended'::character varying)::text, ('retired'::character varying)::text])) AND (capabilities <@ ARRAY['inventory'::character varying])))
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
    CONSTRAINT clinic_invoices_values CHECK ((((currency)::text ~ '^[A-Z]{3}$'::text) AND (length(TRIM(BOTH FROM status)) > 0) AND (length(TRIM(BOTH FROM rounding_policy_version)) > 0)))
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
    starts_at timestamp(6) without time zone NOT NULL,
    ends_at timestamp(6) without time zone NOT NULL,
    site_id bigint,
    visit_type_id bigint,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    requested_at timestamp(6) without time zone CONSTRAINT clinic_patient_portal_appointment_request_requested_at_not_null NOT NULL,
    reviewed_at timestamp(6) without time zone,
    review_note character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_patient_portal_appointment_requests_values CHECK ((((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'declined'::character varying, 'cancelled'::character varying])::text[])) AND (ends_at > starts_at)))
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
    date_of_birth date,
    sex character varying(40),
    height_cm numeric(5,2),
    weight_kg numeric(6,2),
    CONSTRAINT clinic_patients_birth_date_not_future CHECK (((date_of_birth IS NULL) OR (date_of_birth <= CURRENT_DATE))),
    CONSTRAINT clinic_patients_height_range CHECK (((height_cm IS NULL) OR ((height_cm >= (30)::numeric) AND (height_cm <= (300)::numeric)))),
    CONSTRAINT clinic_patients_weight_range CHECK (((weight_kg IS NULL) OR ((weight_kg >= 0.1) AND (weight_kg <= (500)::numeric))))
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
    CONSTRAINT clinic_payment_allocations_amount CHECK ((amount > (0)::numeric))
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
    CONSTRAINT pharmacy_batch_status CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('quarantined'::character varying)::text, ('recalled'::character varying)::text])))
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
    CONSTRAINT pharmacy_movement_direction CHECK (((((kind)::text = ANY (ARRAY[('receipt'::character varying)::text, ('adjustment_in'::character varying)::text])) AND (quantity > 0)) OR (((kind)::text = ANY (ARRAY[('adjustment_out'::character varying)::text, ('damaged'::character varying)::text, ('expired'::character varying)::text, ('return_to_supplier'::character varying)::text])) AND (quantity < 0)))),
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
    CONSTRAINT inventory_package_unit CHECK ((((stock_unit)::text <> 'package'::text) OR (package_size = (1)::numeric))),
    CONSTRAINT inventory_product_units CHECK ((((stock_unit)::text = ANY (ARRAY[('package'::character varying)::text, ('each'::character varying)::text, ('tablet'::character varying)::text, ('capsule'::character varying)::text, ('vial'::character varying)::text, ('mL'::character varying)::text, ('g'::character varying)::text])) AND ((quantity_scale >= 0) AND (quantity_scale <= 6)) AND (((stock_unit)::text = ANY (ARRAY[('mL'::character varying)::text, ('g'::character varying)::text])) OR (quantity_scale = 0)) AND (package_size > (0)::numeric) AND (package_size <= (1000000)::numeric) AND (package_size = round(package_size, quantity_scale)) AND ((package_size = (1)::numeric) OR (length(TRIM(BOTH FROM unit_reference)) > 0)))),
    CONSTRAINT inventory_unit_evidence CHECK (((package_size = (1)::numeric) OR ((unit_reference IS NOT NULL) AND (length(TRIM(BOTH FROM unit_reference)) > 0)))),
    CONSTRAINT pharmacy_product_dea_schedule CHECK (((dea_schedule IS NULL) OR ((dea_schedule)::text = ANY ((ARRAY['II'::character varying, 'III'::character varying, 'IV'::character varying, 'V'::character varying])::text[])))),
    CONSTRAINT pharmacy_product_source CHECK (((source)::text = ANY (ARRAY[('manual'::character varying)::text, ('openfda'::character varying)::text, ('synthetic'::character varying)::text]))),
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
    CONSTRAINT clinic_refund_events_values CHECK ((((currency)::text ~ '^[A-Z]{3}$'::text) AND (amount > (0)::numeric)))
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
-- Name: clinic_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_sites (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    code character varying NOT NULL,
    timezone_override character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT clinic_sites_code_present CHECK ((length(TRIM(BOTH FROM code)) > 0))
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
    updated_at timestamp(6) without time zone NOT NULL
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
-- Name: clinic_inventory_counts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_counts_id_seq'::regclass);


--
-- Name: clinic_inventory_entries id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_entries_id_seq'::regclass);


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
-- Name: clinic_inventory_shipment_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_shipment_lines_id_seq'::regclass);


--
-- Name: clinic_inventory_shipments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipments ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_shipments_id_seq'::regclass);


--
-- Name: clinic_inventory_suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_suppliers ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_suppliers_id_seq'::regclass);


--
-- Name: clinic_inventory_transfers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_transfers_id_seq'::regclass);


--
-- Name: clinic_invoice_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_lines ALTER COLUMN id SET DEFAULT nextval('public.clinic_invoice_lines_id_seq'::regclass);


--
-- Name: clinic_invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoices ALTER COLUMN id SET DEFAULT nextval('public.clinic_invoices_id_seq'::regclass);


--
-- Name: clinic_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_items ALTER COLUMN id SET DEFAULT nextval('public.clinic_items_id_seq'::regclass);


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
-- Name: clinic_payment_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_payment_events_id_seq'::regclass);


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
-- Name: clinic_sites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_sites ALTER COLUMN id SET DEFAULT nextval('public.clinic_sites_id_seq'::regclass);


--
-- Name: clinic_staff_address_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_address_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_address_versions_id_seq'::regclass);


--
-- Name: clinic_staff_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_members ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_members_id_seq'::regclass);


--
-- Name: clinic_stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements ALTER COLUMN id SET DEFAULT nextval('public.clinic_stock_movements_id_seq'::regclass);


--
-- Name: clinic_supplier_address_versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_supplier_address_versions ALTER COLUMN id SET DEFAULT nextval('public.clinic_supplier_address_versions_id_seq'::regclass);


--
-- Name: clinic_visit_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_visit_types ALTER COLUMN id SET DEFAULT nextval('public.clinic_visit_types_id_seq'::regclass);


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
-- Name: clinic_inventory_shipment_lines clinic_inventory_shipment_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines
    ADD CONSTRAINT clinic_inventory_shipment_lines_pkey PRIMARY KEY (id);


--
-- Name: clinic_inventory_shipments clinic_inventory_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipments
    ADD CONSTRAINT clinic_inventory_shipments_pkey PRIMARY KEY (id);


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
-- Name: clinic_invoice_lines clinic_invoice_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoice_lines
    ADD CONSTRAINT clinic_invoice_lines_pkey PRIMARY KEY (id);


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
-- Name: clinic_payment_events clinic_payment_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_events
    ADD CONSTRAINT clinic_payment_events_pkey PRIMARY KEY (id);


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
-- Name: clinic_staff_members clinic_staff_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_members
    ADD CONSTRAINT clinic_staff_members_pkey PRIMARY KEY (id);


--
-- Name: clinic_stock_movements clinic_stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements
    ADD CONSTRAINT clinic_stock_movements_pkey PRIMARY KEY (id);


--
-- Name: clinic_supplier_address_versions clinic_supplier_address_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_supplier_address_versions
    ADD CONSTRAINT clinic_supplier_address_versions_pkey PRIMARY KEY (id);


--
-- Name: clinic_visit_types clinic_visit_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_visit_types
    ADD CONSTRAINT clinic_visit_types_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


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
-- Name: clinic_invoice_lines_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_invoice_lines_practice_id ON public.clinic_invoice_lines USING btree (practice_id, id);


--
-- Name: clinic_invoices_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_invoices_patient_id ON public.clinic_invoices USING btree (practice_id, patient_id, id);


--
-- Name: clinic_invoices_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_invoices_practice_id ON public.clinic_invoices USING btree (practice_id, id);


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
-- Name: clinic_patient_portal_appointment_requests_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_appointment_requests_practice_id ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, id);


--
-- Name: clinic_patient_portal_appointment_requests_request_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_patient_portal_appointment_requests_request_key ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, request_key);


--
-- Name: clinic_patient_portal_appointment_requests_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_patient_portal_appointment_requests_worklist ON public.clinic_patient_portal_appointment_requests USING btree (practice_id, patient_id, status, starts_at);


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
-- Name: clinic_precautions_encounter_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_precautions_encounter_status ON public.clinic_encounter_precautions USING btree (practice_id, encounter_id, status, recorded_at);


--
-- Name: clinic_precautions_patient_encounter_fk; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX clinic_precautions_patient_encounter_fk ON public.clinic_encounter_precautions USING btree (practice_id, patient_id, encounter_id);


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
-- Name: clinic_staff_members_practice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clinic_staff_members_practice_id ON public.clinic_staff_members USING btree (practice_id, id);


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
-- Name: idx_on_actor_session_reference_occurred_at_fc6d32a259; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_actor_session_reference_occurred_at_fc6d32a259 ON public.platform_audit_events USING btree (actor_session_reference, occurred_at);


--
-- Name: idx_on_practice_id_actor_session_reference_occurred_814d8dd62d; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_actor_session_reference_occurred_814d8dd62d ON public.clinic_audit_events USING btree (practice_id, actor_session_reference, occurred_at);


--
-- Name: idx_on_practice_id_booked_clinician_id_starts_at_9122dfc127; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_booked_clinician_id_starts_at_9122dfc127 ON public.clinic_appointments USING btree (practice_id, booked_clinician_id, starts_at);


--
-- Name: idx_on_practice_id_clinician_profile_id_credential__de8ec8ea47; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_clinician_profile_id_credential__de8ec8ea47 ON public.clinic_clinician_credentials USING btree (practice_id, clinician_profile_id, credential_type);


--
-- Name: idx_on_practice_id_encounter_id_effective_from_f3808ef949; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_encounter_id_effective_from_f3808ef949 ON public.clinic_encounter_participants USING btree (practice_id, encounter_id, effective_from);


--
-- Name: idx_on_practice_id_id_0c7a88777c; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_0c7a88777c ON public.clinic_inventory_recall_dispositions USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_40231966ed; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_40231966ed ON public.clinic_inventory_purchase_order_events USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_id_7365d3f122; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_id_7365d3f122 ON public.clinic_inventory_purchase_order_lines USING btree (practice_id, id);


--
-- Name: idx_on_practice_id_invoice_id_id_e53e1ae573; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_invoice_id_id_e53e1ae573 ON public.clinic_invoice_lines USING btree (practice_id, invoice_id, id);


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
-- Name: idx_on_practice_id_payment_event_id_59b16d70c4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_payment_event_id_59b16d70c4 ON public.clinic_payment_allocations USING btree (practice_id, payment_event_id);


--
-- Name: idx_on_practice_id_purchase_order_id_7e353f8cf7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_purchase_order_id_7e353f8cf7 ON public.clinic_inventory_receipts USING btree (practice_id, purchase_order_id);


--
-- Name: idx_on_practice_id_request_key_a63afaee18; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_request_key_a63afaee18 ON public.clinic_pharmacy_batch_events USING btree (practice_id, request_key);


--
-- Name: idx_on_practice_id_room_id_starts_at_a9d2f79b4f; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_room_id_starts_at_a9d2f79b4f ON public.clinic_appointments USING btree (practice_id, room_id, starts_at);


--
-- Name: idx_on_practice_id_site_id_effective_from_9a85bf6413; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_practice_id_site_id_effective_from_9a85bf6413 ON public.clinic_clinician_assignments USING btree (practice_id, site_id, effective_from);


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
-- Name: index_clinic_inventory_locations_on_practice_id_and_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_locations_on_practice_id_and_name ON public.clinic_inventory_locations USING btree (practice_id, name);


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
-- Name: index_identity_preferences_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_identity_preferences_on_user_id ON public.identity_preferences USING btree (user_id);


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
-- Name: inventory_expiry_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_expiry_worklist ON public.clinic_pharmacy_batches USING btree (practice_id, expires_on, id);


--
-- Name: inventory_hold_recall_batch_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_hold_recall_batch_once ON public.clinic_inventory_holds USING btree (recall_id, batch_id) WHERE (recall_id IS NOT NULL);


--
-- Name: inventory_hold_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_hold_retry ON public.clinic_inventory_holds USING btree (practice_id, request_key);


--
-- Name: inventory_hold_transfer_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_hold_transfer_once ON public.clinic_inventory_holds USING btree (transfer_id) WHERE (transfer_id IS NOT NULL);


--
-- Name: inventory_lot_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_lot_identity ON public.clinic_inventory_lots USING btree (practice_id, product_id, number);


--
-- Name: inventory_position_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_position_identity ON public.clinic_pharmacy_batches USING btree (practice_id, lot_id, location_id);


--
-- Name: inventory_purchase_order_event_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_order_event_retry ON public.clinic_inventory_purchase_order_events USING btree (practice_id, request_key);


--
-- Name: inventory_purchase_order_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_order_identity ON public.clinic_inventory_purchase_orders USING btree (practice_id, number);


--
-- Name: inventory_purchase_order_line_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_purchase_order_line_order ON public.clinic_inventory_purchase_order_lines USING btree (purchase_order_id, id);


--
-- Name: inventory_purchase_order_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_purchase_order_retry ON public.clinic_inventory_purchase_orders USING btree (practice_id, request_key);


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
-- Name: inventory_shipment_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_shipment_retry ON public.clinic_inventory_shipments USING btree (practice_id, request_key);


--
-- Name: inventory_transfer_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_transfer_retry ON public.clinic_inventory_transfers USING btree (practice_id, request_key);


--
-- Name: permissions_action_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_action_code ON public.permissions USING btree (action_code);


--
-- Name: pharmacy_batch_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pharmacy_batch_identity ON public.clinic_pharmacy_batches USING btree (product_id, lot_number, location);


--
-- Name: role_version_permissions_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_version_permissions_identity ON public.role_version_permissions USING btree (role_version_id, permission_id);


--
-- Name: role_versions_code_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_versions_code_version ON public.role_versions USING btree (role_code, version);


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
-- Name: clinic_invoice_lines clinic_invoice_lines_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_invoice_lines_immutable BEFORE DELETE OR UPDATE ON public.clinic_invoice_lines FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_invoices clinic_invoices_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_invoices_preserve_identity BEFORE UPDATE ON public.clinic_invoices FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id', 'patient_id', 'currency', 'rounding_policy_version');


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
-- Name: clinic_supplier_address_versions clinic_supplier_address_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_supplier_address_versions_immutable BEFORE DELETE OR UPDATE ON public.clinic_supplier_address_versions FOR EACH ROW EXECUTE FUNCTION public.erd_immutable_record();


--
-- Name: clinic_visit_types clinic_visit_types_preserve_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER clinic_visit_types_preserve_identity BEFORE UPDATE ON public.clinic_visit_types FOR EACH ROW EXECUTE FUNCTION public.erd_preserve_identity('practice_id');


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
-- Name: clinic_inventory_receipt_lines inventory_line_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_line_complete AFTER INSERT ON public.clinic_inventory_receipt_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_complete();


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
-- Name: clinic_inventory_receipts inventory_receipt_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER inventory_receipt_complete AFTER INSERT ON public.clinic_inventory_receipts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_evidence_complete();


--
-- Name: clinic_inventory_receipt_lines inventory_receipt_units; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER inventory_receipt_units BEFORE INSERT ON public.clinic_inventory_receipt_lines FOR EACH ROW EXECUTE FUNCTION public.inventory_receipt_check();


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
-- Name: clinic_invoices fk_invoices_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_invoices
    ADD CONSTRAINT fk_invoices_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


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
-- Name: clinic_patient_portal_appointment_requests fk_patient_portal_appointment_requests_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patient_portal_appointment_requests
    ADD CONSTRAINT fk_patient_portal_appointment_requests_site FOREIGN KEY (practice_id, site_id) REFERENCES public.clinic_sites(practice_id, id);


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
-- Name: clinic_payment_events fk_payment_events_patient; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_payment_events
    ADD CONSTRAINT fk_payment_events_patient FOREIGN KEY (practice_id, patient_id) REFERENCES public.clinic_patients(practice_id, id);


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
-- Name: clinic_clinician_profiles fk_profiles_membership; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_clinician_profiles
    ADD CONSTRAINT fk_profiles_membership FOREIGN KEY (practice_id, membership_id) REFERENCES public.clinic_memberships(practice_id, id);


--
-- Name: clinic_inventory_entries fk_rails_0595133f54; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_0595133f54 FOREIGN KEY (transfer_id) REFERENCES public.clinic_inventory_transfers(id);


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
-- Name: clinic_items fk_rails_0eb41eb72a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_items
    ADD CONSTRAINT fk_rails_0eb41eb72a FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_purchase_order_lines fk_rails_1045935d36; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_lines
    ADD CONSTRAINT fk_rails_1045935d36 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_inventory_transfers fk_rails_13090eedc1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers
    ADD CONSTRAINT fk_rails_13090eedc1 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


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
-- Name: clinic_pharmacy_batches fk_rails_19fd59cee4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches
    ADD CONSTRAINT fk_rails_19fd59cee4 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_inventory_purchase_order_events fk_rails_1dcd7a8add; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_events
    ADD CONSTRAINT fk_rails_1dcd7a8add FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_pharmacy_batch_events fk_rails_22ef15e821; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batch_events
    ADD CONSTRAINT fk_rails_22ef15e821 FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_billing_receipts fk_rails_273fc7946f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_billing_receipts
    ADD CONSTRAINT fk_rails_273fc7946f FOREIGN KEY (issued_by_id) REFERENCES public.users(id);


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
-- Name: clinic_inventory_receipts fk_rails_2adca6eead; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_2adca6eead FOREIGN KEY (practice_id, supplier_id) REFERENCES public.clinic_inventory_suppliers(practice_id, id);


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
-- Name: clinic_inventory_control_reviews fk_rails_30306e2c82; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_control_reviews
    ADD CONSTRAINT fk_rails_30306e2c82 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_profiles fk_rails_30d58630f8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_profiles
    ADD CONSTRAINT fk_rails_30d58630f8 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_cash_drawer_sessions fk_rails_3168137046; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions
    ADD CONSTRAINT fk_rails_3168137046 FOREIGN KEY (closed_by_id) REFERENCES public.users(id);


--
-- Name: clinic_cash_tenders fk_rails_3309419654; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders
    ADD CONSTRAINT fk_rails_3309419654 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_hold_releases fk_rails_34bdf26d4a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases
    ADD CONSTRAINT fk_rails_34bdf26d4a FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_holds fk_rails_384dda0594; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_384dda0594 FOREIGN KEY (transfer_id) REFERENCES public.clinic_inventory_transfers(id);


--
-- Name: clinic_inventory_transfers fk_rails_3979f721e6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers
    ADD CONSTRAINT fk_rails_3979f721e6 FOREIGN KEY (practice_id, source_batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


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
-- Name: clinic_inventory_hold_releases fk_rails_3cb4861c1b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases
    ADD CONSTRAINT fk_rails_3cb4861c1b FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_inventory_recall_lots fk_rails_40cc42df76; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_lots
    ADD CONSTRAINT fk_rails_40cc42df76 FOREIGN KEY (practice_id, lot_id) REFERENCES public.clinic_inventory_lots(practice_id, id);


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
-- Name: clinic_inventory_recall_dispositions fk_rails_447e3e1e2e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_dispositions
    ADD CONSTRAINT fk_rails_447e3e1e2e FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_profiles fk_rails_4a6252adbd; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_profiles
    ADD CONSTRAINT fk_rails_4a6252adbd FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


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
-- Name: clinic_cash_drawer_sessions fk_rails_55951ba890; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_drawer_sessions
    ADD CONSTRAINT fk_rails_55951ba890 FOREIGN KEY (opened_by_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_recalls fk_rails_5c3a4539ae; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recalls
    ADD CONSTRAINT fk_rails_5c3a4539ae FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_inventory_catalog_events fk_rails_5d0903c7f3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events
    ADD CONSTRAINT fk_rails_5d0903c7f3 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


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
-- Name: clinic_inventory_purchase_order_events fk_rails_70745ee0a1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_order_events
    ADD CONSTRAINT fk_rails_70745ee0a1 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


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
-- Name: clinic_inventory_transfers fk_rails_7a15973961; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_transfers
    ADD CONSTRAINT fk_rails_7a15973961 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_counts fk_rails_7c1445f2e5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT fk_rails_7c1445f2e5 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_inventory_lots fk_rails_838cdb3be4; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_lots
    ADD CONSTRAINT fk_rails_838cdb3be4 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_inventory_counts fk_rails_88b808adc3; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT fk_rails_88b808adc3 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_shipment_lines fk_rails_8fc90ea7a2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines
    ADD CONSTRAINT fk_rails_8fc90ea7a2 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_cash_tenders fk_rails_9722709391; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_cash_tenders
    ADD CONSTRAINT fk_rails_9722709391 FOREIGN KEY (recorded_by_id) REFERENCES public.users(id);


--
-- Name: clinic_patients fk_rails_97dd7e2d22; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patients
    ADD CONSTRAINT fk_rails_97dd7e2d22 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


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
-- Name: clinic_inventory_catalog_events fk_rails_9cbaf2de55; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events
    ADD CONSTRAINT fk_rails_9cbaf2de55 FOREIGN KEY (practice_id, product_id) REFERENCES public.clinic_pharmacy_products(practice_id, id);


--
-- Name: clinic_stock_movements fk_rails_a204b55367; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements
    ADD CONSTRAINT fk_rails_a204b55367 FOREIGN KEY (item_id) REFERENCES public.clinic_items(id);


--
-- Name: clinic_pharmacy_batches fk_rails_a32323ffa1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches
    ADD CONSTRAINT fk_rails_a32323ffa1 FOREIGN KEY (practice_id, location_id) REFERENCES public.clinic_inventory_locations(practice_id, id);


--
-- Name: clinic_inventory_shipment_lines fk_rails_a56c476f5d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipment_lines
    ADD CONSTRAINT fk_rails_a56c476f5d FOREIGN KEY (practice_id, shipment_id) REFERENCES public.clinic_inventory_shipments(practice_id, id);


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
-- Name: clinic_inventory_suppliers fk_rails_ab28ffbe7b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_suppliers
    ADD CONSTRAINT fk_rails_ab28ffbe7b FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


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
-- Name: clinic_inventory_holds fk_rails_b490831fc1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_b490831fc1 FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_inventory_purchase_orders fk_rails_b720404725; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_purchase_orders
    ADD CONSTRAINT fk_rails_b720404725 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_entries fk_rails_b8cd22dd7c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_b8cd22dd7c FOREIGN KEY (practice_id, count_id) REFERENCES public.clinic_inventory_counts(practice_id, id);


--
-- Name: clinic_inventory_count_approvals fk_rails_b8e7132e3c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals
    ADD CONSTRAINT fk_rails_b8e7132e3c FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: learning_progresses fk_rails_b9fd1490bb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_progresses
    ADD CONSTRAINT fk_rails_b9fd1490bb FOREIGN KEY (material_id) REFERENCES public.materials(id);


--
-- Name: clinic_stock_movements fk_rails_bcd06826f5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements
    ADD CONSTRAINT fk_rails_bcd06826f5 FOREIGN KEY (actor_id) REFERENCES public.users(id);


--
-- Name: clinic_inventory_receipts fk_rails_c34fa1ffdc; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_c34fa1ffdc FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


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
-- Name: clinic_inventory_recall_dispositions fk_rails_cf064c4850; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recall_dispositions
    ADD CONSTRAINT fk_rails_cf064c4850 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_receipts fk_rails_d151644211; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_d151644211 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


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
-- Name: clinic_inventory_recalls fk_rails_dccd1e6686; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recalls
    ADD CONSTRAINT fk_rails_dccd1e6686 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


--
-- Name: clinic_inventory_receipts fk_rails_e0cba62533; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts
    ADD CONSTRAINT fk_rails_e0cba62533 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


--
-- Name: clinic_inventory_counts fk_rails_e3e20ad7be; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_counts
    ADD CONSTRAINT fk_rails_e3e20ad7be FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


--
-- Name: clinic_inventory_count_approvals fk_rails_e61d4862fb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_count_approvals
    ADD CONSTRAINT fk_rails_e61d4862fb FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


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
-- Name: clinic_inventory_shipments fk_rails_edc1f124e2; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_shipments
    ADD CONSTRAINT fk_rails_edc1f124e2 FOREIGN KEY (practice_id, purchase_order_id) REFERENCES public.clinic_inventory_purchase_orders(practice_id, id);


--
-- Name: clinic_inventory_entries fk_rails_efa7833c43; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_efa7833c43 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


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
-- Name: clinic_pharmacy_batches fk_rails_f379e7d3d0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batches
    ADD CONSTRAINT fk_rails_f379e7d3d0 FOREIGN KEY (practice_id, lot_id) REFERENCES public.clinic_inventory_lots(practice_id, id);


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
-- Name: clinic_inventory_recalls fk_rails_fc73ce6297; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_recalls
    ADD CONSTRAINT fk_rails_fc73ce6297 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


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
-- Name: clinic_staff_address_versions fk_staff_addresses_staff; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_address_versions
    ADD CONSTRAINT fk_staff_addresses_staff FOREIGN KEY (practice_id, staff_member_id) REFERENCES public.clinic_staff_members(practice_id, id);


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
-- PostgreSQL database dump complete
--

\unrestrict 5OQdrEcgd10hUx4TZU9jGhAFAsuSS9pRMfkhfsymXallHJprqIOXPpsIjcCSRlV
