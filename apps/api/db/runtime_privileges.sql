-- Run as the database owner after EVERY migration/restore. Role passwords are
-- provisioned separately from managed secrets, never in this source file.
REVOKE ALL ON DATABASE apply FROM PUBLIC;
GRANT CONNECT ON DATABASE apply TO apply_runtime;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO apply_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM apply_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apply_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO apply_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO apply_runtime;
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['clinic_inventory_profiles','clinic_inventory_lots','clinic_inventory_receipts','clinic_inventory_receipt_lines','clinic_inventory_entries','clinic_inventory_holds','clinic_inventory_hold_releases','clinic_inventory_counts','clinic_inventory_count_approvals','clinic_inventory_catalog_events','clinic_notes','clinic_pharmacy_batch_events'] LOOP
    EXECUTE format('REVOKE UPDATE, DELETE ON %I FROM apply_runtime',relation);
  END LOOP;
  FOREACH relation IN ARRAY ARRAY['clinic_pharmacy_movements','clinic_stock_movements','schema_migrations','ar_internal_metadata'] LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON %I FROM apply_runtime',relation);
  END LOOP;
END $$;
