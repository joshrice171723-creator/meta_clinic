class HardenVerifiedBackendInvariants < ActiveRecord::Migration[8.1]
  def up
    execute <<~SQL
      ALTER TABLE clinic_appointments DROP CONSTRAINT clinic_appointments_no_provider_overlap;
      ALTER TABLE clinic_appointments DROP CONSTRAINT clinic_appointments_no_room_overlap;
      ALTER TABLE clinic_appointments ADD CONSTRAINT clinic_appointments_no_provider_overlap
        EXCLUDE USING gist (practice_id WITH =, booked_clinician_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
        WHERE (booked_clinician_id IS NOT NULL AND status IN ('scheduled', 'confirmed'));
      ALTER TABLE clinic_appointments ADD CONSTRAINT clinic_appointments_no_room_overlap
        EXCLUDE USING gist (practice_id WITH =, room_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
        WHERE (room_id IS NOT NULL AND status IN ('scheduled', 'confirmed'));

      CREATE FUNCTION erd_preserve_identity() RETURNS trigger LANGUAGE plpgsql AS $$
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
      CREATE FUNCTION erd_freeze_granted_role() RETURNS trigger LANGUAGE plpgsql AS $$
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
      CREATE TRIGGER freeze_granted_role_permissions BEFORE INSERT ON role_version_permissions
        FOR EACH ROW EXECUTE FUNCTION erd_freeze_granted_role();
      CREATE TRIGGER lock_granted_role BEFORE INSERT ON clinic_role_grants
        FOR EACH ROW EXECUTE FUNCTION erd_freeze_granted_role();
    SQL

    identities = {
      clinic_memberships: %w[practice_id user_id],
      clinic_patients: %w[practice_id],
      clinic_staff_members: %w[practice_id],
      clinic_sites: %w[practice_id], clinic_rooms: %w[practice_id site_id],
      clinic_departments: %w[practice_id], clinic_visit_types: %w[practice_id],
      clinic_clinician_profiles: %w[practice_id membership_id],
      clinic_clinician_assignments: %w[practice_id clinician_profile_id department_id site_id effective_from],
      clinic_clinician_credentials: %w[practice_id clinician_profile_id],
      clinic_appointments: %w[practice_id patient_id],
      clinic_encounters: %w[practice_id patient_id appointment_id],
      clinic_encounter_participants: %w[practice_id patient_id encounter_id membership_id effective_from],
      clinic_encounter_notes: %w[practice_id patient_id encounter_id],
      clinic_observations: %w[practice_id patient_id encounter_id author_membership_id parent_observation_id],
      clinic_conditions: %w[practice_id patient_id], clinic_allergies: %w[practice_id patient_id],
      clinic_medication_statements: %w[practice_id patient_id],
      clinic_role_grants: %w[practice_id membership_id role_version_id scope_kind site_id],
      clinic_document_categories: %w[practice_id],
      clinic_documents: %w[practice_id patient_id encounter_id object_key object_version checksum byte_size media_type],
      clinic_message_outbox: %w[practice_id message_intent_id],
      clinic_invoices: %w[practice_id patient_id currency rounding_policy_version]
    }
    identities.each do |table, fields|
      args = fields.map { |field| connection.quote(field) }.join(", ")
      execute "CREATE TRIGGER #{table}_preserve_identity BEFORE UPDATE ON #{table} FOR EACH ROW EXECUTE FUNCTION erd_preserve_identity(#{args})"
    end
    %w[clinic_message_intents clinic_message_attachments clinic_message_delivery_events clinic_invoice_lines clinic_insurance_claims].each do |table|
      execute "CREATE TRIGGER #{table}_immutable BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
    end

    # Index actual referencing tuples used by parent lookups and integrity checks.
    %w[role_version_permissions clinic_role_grants clinic_rooms clinic_clinician_assignments clinic_clinician_credentials
      clinic_appointments clinic_encounters clinic_encounter_participants clinic_encounter_notes clinic_encounter_note_revisions
      clinic_encounter_note_signatures clinic_observations clinic_observation_sources clinic_documents clinic_message_attachments
      clinic_message_delivery_events clinic_invoice_lines clinic_credit_notes clinic_refund_events clinic_insurance_claims].each do |table|
      foreign_keys(table).each do |fk|
        columns = Array(fk.column)
        next if indexes(table).any? { |index| !index.where && Array(index.columns).first(columns.length) == columns }
        add_index table, columns, name: "verify_fk_#{Digest::SHA256.hexdigest("#{table}:#{columns.join(',')}")[0, 16]}"
      end
    end
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Preserve identity and history safeguards; use a reviewed forward fix."
  end
end
