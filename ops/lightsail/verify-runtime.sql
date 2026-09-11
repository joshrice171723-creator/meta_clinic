\set ON_ERROR_STOP on
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apply_runtime'
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole) THEN
    RAISE EXCEPTION 'runtime role has excess authority';
  END IF;
  IF has_schema_privilege('apply_runtime', 'public', 'CREATE') OR
      has_table_privilege('apply_runtime', 'clinic_audit_events', 'DELETE') OR
      has_table_privilege('apply_runtime', 'clinic_audit_events', 'UPDATE') THEN
    RAISE EXCEPTION 'runtime schema or audit mutation is overprivileged';
  END IF;
END $$;
SELECT 'PASS: runtime role is non-owner with schema and audit mutation restrictions';
