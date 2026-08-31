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
-- Name: inventory_authorize(bigint, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.inventory_authorize(clinic bigint, actor bigint, action text, profile bigint DEFAULT NULL::bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE member clinic_memberships%ROWTYPE; configuration clinic_inventory_profiles%ROWTYPE; enabled boolean;
BEGIN
  PERFORM 1 FROM clinic_practices WHERE id=clinic FOR SHARE;
  SELECT active INTO enabled FROM users WHERE id=actor FOR SHARE;
  SELECT * INTO member FROM clinic_memberships WHERE practice_id=clinic AND user_id=actor FOR SHARE;
  IF NOT FOUND THEN RAISE foreign_key_violation USING MESSAGE='Actor has no clinic membership'; END IF;
  IF NOT COALESCE(enabled AND member.active AND member.inventory_access AND (to_jsonb(member)->>('inventory_'||action))::boolean,false) THEN
    RAISE EXCEPTION 'Inventory action not permitted';
  END IF;
  SELECT * INTO configuration FROM clinic_inventory_profiles WHERE practice_id=clinic ORDER BY version DESC LIMIT 1;
  IF action<>'configure' AND (configuration.id IS NULL OR configuration.status<>'synthetic' OR NOT ('inventory'=ANY(configuration.capabilities)) OR (profile IS NOT NULL AND profile<>configuration.id)) THEN
    RAISE EXCEPTION 'Inventory profile is unavailable or stale';
  END IF;
  RETURN configuration.id;
END $$;


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
  action := CASE TG_TABLE_NAME WHEN 'clinic_inventory_receipts' THEN 'receive' WHEN 'clinic_inventory_holds' THEN 'hold' WHEN 'clinic_inventory_hold_releases' THEN 'release' WHEN 'clinic_inventory_counts' THEN 'count' WHEN 'clinic_inventory_count_approvals' THEN 'adjust' WHEN 'clinic_inventory_profiles' THEN 'configure' ELSE 'catalog' END;
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
END $$;


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
  PERFORM inventory_authorize(NEW.practice_id,NEW.actor_id,CASE WHEN NEW.kind='receipt' THEN 'receive' ELSE 'adjust' END,NEW.profile_id);
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
END $$;


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
    updated_at timestamp(6) without time zone NOT NULL
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
    CONSTRAINT inventory_profile_scope CHECK (((version > 0) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'synthetic'::character varying, 'suspended'::character varying, 'retired'::character varying])::text[])) AND (capabilities <@ ARRAY['inventory'::character varying])))
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
    updated_at timestamp(6) without time zone NOT NULL
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
-- Name: clinic_inventory_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_inventory_suppliers (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    name character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
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
    inventory_configure boolean DEFAULT false NOT NULL
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
-- Name: clinic_patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_patients (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    display_name text NOT NULL,
    reference character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
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
    CONSTRAINT inventory_package_unit CHECK ((((stock_unit)::text <> 'package'::text) OR (package_size = (1)::numeric))),
    CONSTRAINT inventory_product_units CHECK ((((stock_unit)::text = ANY ((ARRAY['package'::character varying, 'each'::character varying, 'tablet'::character varying, 'capsule'::character varying, 'vial'::character varying, 'mL'::character varying, 'g'::character varying])::text[])) AND ((quantity_scale >= 0) AND (quantity_scale <= 6)) AND (((stock_unit)::text = ANY ((ARRAY['mL'::character varying, 'g'::character varying])::text[])) OR (quantity_scale = 0)) AND (package_size > (0)::numeric) AND (package_size <= (1000000)::numeric) AND (package_size = round(package_size, quantity_scale)) AND ((package_size = (1)::numeric) OR (length(TRIM(BOTH FROM unit_reference)) > 0)))),
    CONSTRAINT inventory_unit_evidence CHECK (((package_size = (1)::numeric) OR ((unit_reference IS NOT NULL) AND (length(TRIM(BOTH FROM unit_reference)) > 0)))),
    CONSTRAINT pharmacy_product_source CHECK (((source)::text = ANY ((ARRAY['manual'::character varying, 'openfda'::character varying, 'synthetic'::character varying])::text[]))),
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
    timezone character varying DEFAULT 'UTC'::character varying NOT NULL
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
-- Name: clinic_staff_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clinic_staff_members (
    id bigint NOT NULL,
    practice_id bigint NOT NULL,
    display_name text NOT NULL,
    job_title character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
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
-- Name: clinic_inventory_catalog_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_catalog_events_id_seq'::regclass);


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
-- Name: clinic_inventory_receipt_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipt_lines ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_receipt_lines_id_seq'::regclass);


--
-- Name: clinic_inventory_receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_receipts ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_receipts_id_seq'::regclass);


--
-- Name: clinic_inventory_suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_suppliers ALTER COLUMN id SET DEFAULT nextval('public.clinic_inventory_suppliers_id_seq'::regclass);


--
-- Name: clinic_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_items ALTER COLUMN id SET DEFAULT nextval('public.clinic_items_id_seq'::regclass);


--
-- Name: clinic_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_memberships ALTER COLUMN id SET DEFAULT nextval('public.clinic_memberships_id_seq'::regclass);


--
-- Name: clinic_notes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes ALTER COLUMN id SET DEFAULT nextval('public.clinic_notes_id_seq'::regclass);


--
-- Name: clinic_patients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patients ALTER COLUMN id SET DEFAULT nextval('public.clinic_patients_id_seq'::regclass);


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
-- Name: clinic_staff_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_staff_members ALTER COLUMN id SET DEFAULT nextval('public.clinic_staff_members_id_seq'::regclass);


--
-- Name: clinic_stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_stock_movements ALTER COLUMN id SET DEFAULT nextval('public.clinic_stock_movements_id_seq'::regclass);


--
-- Name: contact_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages ALTER COLUMN id SET DEFAULT nextval('public.contact_messages_id_seq'::regclass);


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
-- Name: paperworks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paperworks ALTER COLUMN id SET DEFAULT nextval('public.paperworks_id_seq'::regclass);


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
-- Name: clinic_inventory_catalog_events clinic_inventory_catalog_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_catalog_events
    ADD CONSTRAINT clinic_inventory_catalog_events_pkey PRIMARY KEY (id);


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
-- Name: clinic_inventory_suppliers clinic_inventory_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_suppliers
    ADD CONSTRAINT clinic_inventory_suppliers_pkey PRIMARY KEY (id);


--
-- Name: clinic_items clinic_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_items
    ADD CONSTRAINT clinic_items_pkey PRIMARY KEY (id);


--
-- Name: clinic_memberships clinic_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_memberships
    ADD CONSTRAINT clinic_memberships_pkey PRIMARY KEY (id);


--
-- Name: clinic_notes clinic_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes
    ADD CONSTRAINT clinic_notes_pkey PRIMARY KEY (id);


--
-- Name: clinic_patients clinic_patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_patients
    ADD CONSTRAINT clinic_patients_pkey PRIMARY KEY (id);


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
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


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
-- Name: paperworks paperworks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paperworks
    ADD CONSTRAINT paperworks_pkey PRIMARY KEY (id);


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
-- Name: idx_on_practice_id_request_key_a63afaee18; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_on_practice_id_request_key_a63afaee18 ON public.clinic_pharmacy_batch_events USING btree (practice_id, request_key);


--
-- Name: index_clinic_inventory_catalog_events_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_catalog_events_on_practice_id_and_id ON public.clinic_inventory_catalog_events USING btree (practice_id, id);


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
-- Name: index_clinic_inventory_entries_on_receipt_line_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_entries_on_receipt_line_id ON public.clinic_inventory_entries USING btree (receipt_line_id);


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
-- Name: index_clinic_inventory_suppliers_on_practice_id_and_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_suppliers_on_practice_id_and_id ON public.clinic_inventory_suppliers USING btree (practice_id, id);


--
-- Name: index_clinic_inventory_suppliers_on_practice_id_and_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_clinic_inventory_suppliers_on_practice_id_and_name ON public.clinic_inventory_suppliers USING btree (practice_id, name);


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
-- Name: inventory_count_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_count_retry ON public.clinic_inventory_counts USING btree (practice_id, request_key);


--
-- Name: inventory_entry_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_entry_retry ON public.clinic_inventory_entries USING btree (practice_id, request_key);


--
-- Name: inventory_expiry_worklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX inventory_expiry_worklist ON public.clinic_pharmacy_batches USING btree (practice_id, expires_on, id);


--
-- Name: inventory_hold_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_hold_retry ON public.clinic_inventory_holds USING btree (practice_id, request_key);


--
-- Name: inventory_lot_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_lot_identity ON public.clinic_inventory_lots USING btree (practice_id, product_id, number);


--
-- Name: inventory_position_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_position_identity ON public.clinic_pharmacy_batches USING btree (practice_id, lot_id, location_id);


--
-- Name: inventory_receipt_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_receipt_retry ON public.clinic_inventory_receipts USING btree (practice_id, request_key);


--
-- Name: inventory_release_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX inventory_release_retry ON public.clinic_inventory_hold_releases USING btree (practice_id, request_key);


--
-- Name: pharmacy_batch_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX pharmacy_batch_identity ON public.clinic_pharmacy_batches USING btree (product_id, lot_number, location);


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
-- Name: clinic_pharmacy_batch_events pharmacy_event_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pharmacy_event_guard BEFORE DELETE OR UPDATE ON public.clinic_pharmacy_batch_events FOR EACH ROW EXECUTE FUNCTION public.legacy_pharmacy_guard();


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
-- Name: clinic_pharmacy_batch_events fk_rails_22ef15e821; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_pharmacy_batch_events
    ADD CONSTRAINT fk_rails_22ef15e821 FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


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
-- Name: clinic_inventory_profiles fk_rails_30d58630f8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_profiles
    ADD CONSTRAINT fk_rails_30d58630f8 FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


--
-- Name: clinic_inventory_hold_releases fk_rails_34bdf26d4a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_hold_releases
    ADD CONSTRAINT fk_rails_34bdf26d4a FOREIGN KEY (practice_id) REFERENCES public.clinic_practices(id);


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
-- Name: clinic_notes fk_rails_78e5dea8d0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_notes
    ADD CONSTRAINT fk_rails_78e5dea8d0 FOREIGN KEY (practice_id, author_id) REFERENCES public.clinic_memberships(practice_id, user_id);


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
-- Name: clinic_inventory_holds fk_rails_b490831fc1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_holds
    ADD CONSTRAINT fk_rails_b490831fc1 FOREIGN KEY (practice_id, batch_id) REFERENCES public.clinic_pharmacy_batches(practice_id, id);


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
-- Name: clinic_inventory_entries fk_rails_cc415ce543; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_cc415ce543 FOREIGN KEY (practice_id, actor_id) REFERENCES public.clinic_memberships(practice_id, user_id);


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
-- Name: clinic_inventory_entries fk_rails_efa7833c43; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clinic_inventory_entries
    ADD CONSTRAINT fk_rails_efa7833c43 FOREIGN KEY (practice_id, profile_id) REFERENCES public.clinic_inventory_profiles(practice_id, id);


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
-- PostgreSQL database dump complete
--

SET search_path TO "$user", public;

INSERT INTO "schema_migrations" (version) VALUES
('20260830000800'),
('20260830000700'),
('20260830000600'),
('20260830000500'),
('20260830000400'),
('20260830000300'),
('20260830000200'),
('20260830000100');

