class CompletePrimaryCareIntakeAndExternalLabChain < ActiveRecord::Migration[8.1]
  def up
    add_column :clinic_patient_demographics, :legal_name, :text
    add_column :clinic_patient_demographics, :preferred_name, :text

    create_table :clinic_lab_specimens do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.bigint :service_request_revision_id, null: false
      t.text :specimen_identifier
      t.string :specimen_type_code, null: false, limit: 80
      t.text :specimen_type_display, null: false
      t.string :condition_code, null: false, limit: 32
      t.column :collected_at, "timestamp(6) with time zone", null: false
      t.bigint :collected_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.timestamps
    end
    add_index :clinic_lab_specimens, %i[practice_id id], unique: true, name: "lab_specimens_practice_id"
    add_index :clinic_lab_specimens, %i[practice_id patient_id encounter_id id], unique: true,
      name: "lab_specimens_context_id"
    add_index :clinic_lab_specimens, %i[practice_id service_request_revision_id collected_at id],
      name: "lab_specimens_order_timeline"
    add_foreign_key :clinic_lab_specimens, :clinic_practices, column: :practice_id,
      name: "fk_lab_specimens_practice"
    add_foreign_key :clinic_lab_specimens, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_lab_specimens_patient"
    add_foreign_key :clinic_lab_specimens, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_lab_specimens_encounter"
    add_foreign_key :clinic_lab_specimens, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "fk_lab_specimens_site"
    add_foreign_key :clinic_lab_specimens, :clinic_service_request_revisions,
      column: %i[practice_id patient_id encounter_id service_request_revision_id],
      primary_key: %i[practice_id patient_id encounter_id id], name: "fk_lab_specimens_service_request"
    add_foreign_key :clinic_lab_specimens, :clinic_memberships,
      column: %i[practice_id collected_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_lab_specimens_collector"
    add_check_constraint :clinic_lab_specimens,
      "condition_code IN ('satisfactory','compromised','unknown') AND " \
      "char_length(trim(specimen_type_code)) BETWEEN 1 AND 80 AND " \
      "char_length(trim(specimen_type_display)) BETWEEN 1 AND 160",
      name: "lab_specimens_values"
    execute <<~SQL
      CREATE TRIGGER clinic_lab_specimens_immutable
      BEFORE UPDATE OR DELETE ON clinic_lab_specimens
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL

    add_column :clinic_lab_reports, :service_request_revision_id, :bigint
    add_column :clinic_lab_reports, :lab_specimen_id, :bigint
    add_foreign_key :clinic_lab_reports, :clinic_service_request_revisions,
      column: %i[practice_id service_request_revision_id],
      primary_key: %i[practice_id id], name: "fk_lab_reports_service_request"
    add_foreign_key :clinic_lab_reports, :clinic_lab_specimens,
      column: %i[practice_id lab_specimen_id],
      primary_key: %i[practice_id id], name: "fk_lab_reports_specimen"
    add_check_constraint :clinic_lab_reports,
      "(service_request_revision_id IS NULL) = (lab_specimen_id IS NULL)",
      name: "lab_reports_order_specimen_pair"

    add_column :clinic_lab_report_versions, :result_priority, :string, null: false, default: "routine", limit: 16
    add_check_constraint :clinic_lab_report_versions,
      "result_priority IN ('routine','urgent','critical')", name: "lab_report_versions_priority"
    execute "DROP TRIGGER IF EXISTS clinic_lab_report_versions_protect ON clinic_lab_report_versions"
    execute "DROP FUNCTION IF EXISTS clinic_lab_report_versions_protect()"
    execute <<~SQL
      CREATE FUNCTION clinic_lab_report_versions_protect() RETURNS trigger
      LANGUAGE plpgsql AS $$
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
          OR OLD.result_priority IS DISTINCT FROM NEW.result_priority
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
      CREATE TRIGGER clinic_lab_report_versions_protect
      BEFORE UPDATE OR DELETE ON clinic_lab_report_versions
      FOR EACH ROW EXECUTE FUNCTION clinic_lab_report_versions_protect();
    SQL

    add_column :clinic_lab_result_follow_ups, :priority, :string, null: false, default: "routine", limit: 16
    add_column :clinic_lab_result_follow_ups, :due_at, "timestamp(6) with time zone"
    add_column :clinic_lab_result_follow_ups, :escalated_at, "timestamp(6) with time zone"
    add_column :clinic_lab_result_follow_ups, :escalated_by_membership_id, :bigint
    add_column :clinic_lab_result_follow_ups, :patient_contact_status, :string, limit: 24
    add_column :clinic_lab_result_follow_ups, :patient_contact_method, :string, limit: 24
    add_column :clinic_lab_result_follow_ups, :patient_contact_at, "timestamp(6) with time zone"
    add_foreign_key :clinic_lab_result_follow_ups, :clinic_memberships,
      column: %i[practice_id escalated_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_lab_follow_ups_escalator"
    add_index :clinic_lab_result_follow_ups, %i[practice_id state priority due_at id],
      where: "state = 'open'", name: "clinic_lab_follow_ups_priority_queue"
    remove_check_constraint :clinic_lab_result_follow_ups, name: "clinic_lab_follow_ups_values"
    remove_check_constraint :clinic_lab_result_follow_ups, name: "clinic_lab_follow_ups_state_evidence"
    add_check_constraint :clinic_lab_result_follow_ups,
      "state IN ('open','completed','not_required','superseded') AND " \
      "priority IN ('routine','urgent','critical') AND " \
      "(instructions IS NULL OR char_length(trim(instructions)) BETWEEN 1 AND 1000) AND " \
      "(outcome IS NULL OR char_length(trim(outcome)) BETWEEN 1 AND 1000) AND " \
      "(patient_contact_status IS NULL OR patient_contact_status IN ('informed','not_reached','not_required')) AND " \
      "(patient_contact_method IS NULL OR patient_contact_method IN ('portal','phone','in_person','letter','other'))",
      name: "clinic_lab_follow_ups_values"
    add_check_constraint :clinic_lab_result_follow_ups, <<~SQL.squish, name: "clinic_lab_follow_ups_state_evidence"
      (
        state = 'open' AND instructions IS NOT NULL AND outcome IS NULL
          AND completed_at IS NULL AND completed_by_membership_id IS NULL AND superseded_at IS NULL
          AND patient_contact_status IS NULL AND patient_contact_method IS NULL AND patient_contact_at IS NULL
      ) OR (
        state = 'completed' AND instructions IS NOT NULL AND outcome IS NOT NULL
          AND completed_at IS NOT NULL AND completed_by_membership_id IS NOT NULL AND superseded_at IS NULL
          AND (priority <> 'critical' OR patient_contact_status IS NOT NULL)
          AND (patient_contact_status IS NULL OR patient_contact_status = 'not_required'
            OR patient_contact_at IS NOT NULL)
          AND (patient_contact_status IS NULL OR patient_contact_status <> 'informed'
            OR patient_contact_method IS NOT NULL)
      ) OR (
        state = 'not_required' AND outcome IS NULL
          AND completed_at IS NULL AND completed_by_membership_id IS NULL AND superseded_at IS NULL
          AND priority = 'routine' AND patient_contact_status IS NULL
      ) OR (
        state = 'superseded' AND instructions IS NOT NULL AND outcome IS NULL
          AND completed_at IS NULL AND completed_by_membership_id IS NULL AND superseded_at IS NOT NULL
          AND patient_contact_status IS NULL
      )
    SQL
    add_check_constraint :clinic_lab_result_follow_ups,
      "(priority = 'routine' AND escalated_at IS NULL AND escalated_by_membership_id IS NULL) OR " \
      "(priority IN ('urgent','critical') AND due_at IS NOT NULL AND escalated_at IS NOT NULL " \
      "AND escalated_by_membership_id IS NOT NULL)", name: "clinic_lab_follow_ups_escalation_evidence"
    execute "DROP TRIGGER IF EXISTS clinic_lab_result_follow_ups_protect ON clinic_lab_result_follow_ups"
    execute "DROP FUNCTION IF EXISTS clinic_lab_result_follow_ups_protect()"
    execute <<~SQL
      CREATE FUNCTION clinic_lab_result_follow_ups_protect() RETURNS trigger
      LANGUAGE plpgsql AS $$
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
          OR OLD.priority IS DISTINCT FROM NEW.priority
          OR OLD.due_at IS DISTINCT FROM NEW.due_at
          OR OLD.escalated_at IS DISTINCT FROM NEW.escalated_at
          OR OLD.escalated_by_membership_id IS DISTINCT FROM NEW.escalated_by_membership_id
          OR OLD.recorded_by_membership_id IS DISTINCT FROM NEW.recorded_by_membership_id
          OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at
          OR OLD.created_at IS DISTINCT FROM NEW.created_at
          OR OLD.state <> 'open'
          OR NEW.state NOT IN ('completed', 'superseded') THEN
          RAISE EXCEPTION 'Lab result follow-up evidence is immutable';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER clinic_lab_result_follow_ups_protect
      BEFORE UPDATE OR DELETE ON clinic_lab_result_follow_ups
      FOR EACH ROW EXECUTE FUNCTION clinic_lab_result_follow_ups_protect();
    SQL

    create_table :clinic_patient_education_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :site_id, null: false
      t.string :topic_code, null: false, limit: 32
      t.text :topic_title, null: false
      t.string :delivery_method, null: false, limit: 24
      t.string :recipient, null: false, limit: 16
      t.text :material_title
      t.text :material_url
      t.string :language, null: false, limit: 80
      t.boolean :interpreter_used, null: false, default: false
      t.string :teach_back_status, null: false, limit: 32
      t.text :patient_response
      t.text :reteaching_summary
      t.boolean :follow_up_needed, null: false, default: false
      t.text :follow_up_plan
      t.bigint :recorded_by_membership_id, null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
      t.string :request_key, null: false, limit: 160
      t.timestamps
    end
    add_index :clinic_patient_education_events, %i[practice_id id], unique: true,
      name: "patient_education_practice_id"
    add_index :clinic_patient_education_events, %i[practice_id patient_id encounter_id recorded_at id],
      name: "patient_education_encounter_timeline"
    add_index :clinic_patient_education_events, %i[practice_id recorded_by_membership_id request_key], unique: true,
      name: "patient_education_request_key"
    add_foreign_key :clinic_patient_education_events, :clinic_practices, column: :practice_id,
      name: "fk_patient_education_practice"
    add_foreign_key :clinic_patient_education_events, :clinic_patients,
      column: %i[practice_id patient_id], primary_key: %i[practice_id id], name: "fk_patient_education_patient"
    add_foreign_key :clinic_patient_education_events, :clinic_encounters,
      column: %i[practice_id patient_id encounter_id], primary_key: %i[practice_id patient_id id],
      name: "fk_patient_education_encounter"
    add_foreign_key :clinic_patient_education_events, :clinic_sites,
      column: %i[practice_id site_id], primary_key: %i[practice_id id], name: "fk_patient_education_site"
    add_foreign_key :clinic_patient_education_events, :clinic_memberships,
      column: %i[practice_id recorded_by_membership_id], primary_key: %i[practice_id id],
      name: "fk_patient_education_recorder"
    add_check_constraint :clinic_patient_education_events,
      "topic_code IN ('medication','diagnosis','self_care','warning_signs','procedure','device','follow_up','prevention','other') AND " \
      "delivery_method IN ('discussion','handout','portal','demonstration') AND " \
      "recipient IN ('patient','caregiver','both') AND " \
      "teach_back_status IN ('demonstrated','needs_reteaching','declined','unable','not_applicable')",
      name: "patient_education_codes"
    add_check_constraint :clinic_patient_education_events,
      "char_length(trim(topic_title)) BETWEEN 1 AND 240 AND char_length(trim(language)) BETWEEN 1 AND 80 AND " \
      "(delivery_method NOT IN ('handout','portal') OR material_title IS NOT NULL) AND " \
      "(teach_back_status <> 'demonstrated' OR patient_response IS NOT NULL) AND " \
      "(teach_back_status <> 'needs_reteaching' OR (reteaching_summary IS NOT NULL AND follow_up_needed)) AND " \
      "(NOT follow_up_needed OR follow_up_plan IS NOT NULL)", name: "patient_education_evidence"
    execute <<~SQL
      CREATE TRIGGER clinic_patient_education_events_immutable
      BEFORE UPDATE OR DELETE ON clinic_patient_education_events
      FOR EACH ROW EXECUTE FUNCTION erd_immutable_record();
    SQL
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "Clinical evidence records must be preserved with a forward migration."
  end
end
