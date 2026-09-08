class ImplementApprovedClinicErdSchema < ActiveRecord::Migration[8.1]
  def up
    create_table :organizations do |t|
      t.string :name, null: false
      t.timestamps
    end

    add_column :clinic_practices, :organization_id, :bigint
    add_foreign_key :clinic_practices, :organizations, name: "fk_practices_organization"
    add_index :clinic_practices, :organization_id
    add_index :clinic_memberships, [ :practice_id, :id ], unique: true, name: "clinic_memberships_practice_id"
    add_index :clinic_staff_members, [ :practice_id, :id ], unique: true, name: "clinic_staff_members_practice_id"

    create_tenant_table :clinic_sites do |t|
      t.string :code, null: false
      t.string :timezone_override
    end
    add_index :clinic_sites, [ :practice_id, :code ], unique: true, name: "clinic_sites_practice_code"
    add_check_constraint :clinic_sites, "length(trim(code)) > 0", name: "clinic_sites_code_present"

    create_tenant_table :clinic_rooms do |t|
      t.bigint :site_id, null: false
      t.string :code, null: false
    end
    scoped_fk :clinic_rooms, [ :practice_id, :site_id ], :clinic_sites, [ :practice_id, :id ], "fk_rooms_site"
    add_index :clinic_rooms, [ :practice_id, :site_id, :id ], unique: true, name: "clinic_rooms_practice_site_id"
    add_index :clinic_rooms, [ :practice_id, :site_id, :code ], unique: true, name: "clinic_rooms_site_code"
    add_check_constraint :clinic_rooms, "length(trim(code)) > 0", name: "clinic_rooms_code_present"

    create_tenant_table :clinic_departments do |t|
      t.string :code, null: false
    end
    add_index :clinic_departments, [ :practice_id, :code ], unique: true, name: "clinic_departments_practice_code"
    add_check_constraint :clinic_departments, "length(trim(code)) > 0", name: "clinic_departments_code_present"

    create_tenant_table :clinic_visit_types do |t|
      t.string :code, null: false
      t.datetime :retired_at
    end
    add_index :clinic_visit_types, [ :practice_id, :code ], unique: true, name: "clinic_visit_types_practice_code"
    add_check_constraint :clinic_visit_types, "length(trim(code)) > 0", name: "clinic_visit_types_code_present"

    create_tenant_table :clinic_clinician_profiles do |t|
      t.bigint :membership_id, null: false
    end
    scoped_fk :clinic_clinician_profiles, [ :practice_id, :membership_id ], :clinic_memberships, [ :practice_id, :id ], "fk_profiles_membership"
    add_index :clinic_clinician_profiles, [ :practice_id, :membership_id ], unique: true, name: "clinic_profiles_membership"

    create_tenant_table :clinic_clinician_assignments do |t|
      t.bigint :clinician_profile_id, null: false
      t.bigint :department_id, null: false
      t.bigint :site_id, null: false
      t.datetime :effective_from, null: false
      t.datetime :effective_until
    end
    scoped_fk :clinic_clinician_assignments, [ :practice_id, :clinician_profile_id ], :clinic_clinician_profiles, [ :practice_id, :id ], "fk_assignments_profile"
    scoped_fk :clinic_clinician_assignments, [ :practice_id, :department_id ], :clinic_departments, [ :practice_id, :id ], "fk_assignments_department"
    scoped_fk :clinic_clinician_assignments, [ :practice_id, :site_id ], :clinic_sites, [ :practice_id, :id ], "fk_assignments_site"
    add_index :clinic_clinician_assignments, [ :practice_id, :clinician_profile_id, :department_id, :site_id, :effective_from ], unique: true, name: "clinic_assignments_identity"
    add_index :clinic_clinician_assignments, [ :practice_id, :site_id, :effective_from ]
    add_check_constraint :clinic_clinician_assignments, "effective_until IS NULL OR effective_until > effective_from", name: "clinic_assignments_valid_window"

    create_tenant_table :clinic_clinician_credentials do |t|
      t.bigint :clinician_profile_id, null: false
      t.string :credential_type, null: false
      t.string :jurisdiction, null: false
      t.string :issuer_reference, null: false
      t.string :review_status, null: false
      t.datetime :valid_until
    end
    scoped_fk :clinic_clinician_credentials, [ :practice_id, :clinician_profile_id ], :clinic_clinician_profiles, [ :practice_id, :id ], "fk_credentials_profile"
    add_index :clinic_clinician_credentials, [ :practice_id, :clinician_profile_id, :credential_type ]
    add_check_constraint :clinic_clinician_credentials, "length(trim(credential_type)) > 0 AND length(trim(jurisdiction)) > 0 AND length(trim(issuer_reference)) > 0 AND length(trim(review_status)) > 0", name: "clinic_credentials_fields_present"

    create_tenant_table :clinic_appointments do |t|
      t.bigint :patient_id, null: false
      t.bigint :site_id
      t.bigint :room_id
      t.bigint :booked_clinician_id
      t.bigint :visit_type_id
      t.column :starts_at, "timestamp(6) with time zone", null: false
      t.column :ends_at, "timestamp(6) with time zone", null: false
      t.string :status, null: false
    end
    scoped_fk :clinic_appointments, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_appointments_patient"
    scoped_fk :clinic_appointments, [ :practice_id, :site_id ], :clinic_sites, [ :practice_id, :id ], "fk_appointments_site"
    scoped_fk :clinic_appointments, [ :practice_id, :site_id, :room_id ], :clinic_rooms, [ :practice_id, :site_id, :id ], "fk_appointments_room"
    scoped_fk :clinic_appointments, [ :practice_id, :booked_clinician_id ], :clinic_clinician_profiles, [ :practice_id, :id ], "fk_appointments_clinician"
    scoped_fk :clinic_appointments, [ :practice_id, :visit_type_id ], :clinic_visit_types, [ :practice_id, :id ], "fk_appointments_visit_type"
    add_index :clinic_appointments, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_appointments_practice_patient_id"
    add_index :clinic_appointments, [ :practice_id, :patient_id, :starts_at ]
    add_index :clinic_appointments, [ :practice_id, :booked_clinician_id, :starts_at ]
    add_index :clinic_appointments, [ :practice_id, :room_id, :starts_at ]
    add_check_constraint :clinic_appointments, "ends_at > starts_at", name: "clinic_appointments_valid_time_range"
    add_check_constraint :clinic_appointments, "room_id IS NULL OR site_id IS NOT NULL", name: "clinic_appointments_room_requires_site"
    add_check_constraint :clinic_appointments, "length(trim(status)) > 0", name: "clinic_appointments_status_present"

    create_tenant_table :clinic_encounters do |t|
      t.bigint :patient_id, null: false
      t.bigint :appointment_id
      t.bigint :site_id
      t.bigint :room_id
      t.column :started_at, "timestamp(6) with time zone", null: false
      t.column :ended_at, "timestamp(6) with time zone"
      t.string :status, null: false
    end
    add_index :clinic_encounters, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_encounters_practice_patient_id"
    scoped_fk :clinic_encounters, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_encounters_patient"
    scoped_fk :clinic_encounters, [ :practice_id, :patient_id, :appointment_id ], :clinic_appointments, [ :practice_id, :patient_id, :id ], "fk_encounters_appointment"
    scoped_fk :clinic_encounters, [ :practice_id, :site_id ], :clinic_sites, [ :practice_id, :id ], "fk_encounters_site"
    scoped_fk :clinic_encounters, [ :practice_id, :site_id, :room_id ], :clinic_rooms, [ :practice_id, :site_id, :id ], "fk_encounters_room"
    add_index :clinic_encounters, [ :practice_id, :appointment_id ], unique: true, where: "appointment_id IS NOT NULL", name: "clinic_encounters_one_per_appointment"
    add_index :clinic_encounters, [ :practice_id, :patient_id, :started_at ]
    add_check_constraint :clinic_encounters, "ended_at IS NULL OR ended_at > started_at", name: "clinic_encounters_valid_time_range"
    add_check_constraint :clinic_encounters, "room_id IS NULL OR site_id IS NOT NULL", name: "clinic_encounters_room_requires_site"
    add_check_constraint :clinic_encounters, "length(trim(status)) > 0", name: "clinic_encounters_status_present"

    create_tenant_table :clinic_encounter_participants do |t|
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.bigint :membership_id, null: false
      t.string :participation_role, null: false
      t.column :effective_from, "timestamp(6) with time zone", null: false
      t.column :effective_until, "timestamp(6) with time zone"
    end
    scoped_fk :clinic_encounter_participants, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_participants_patient"
    scoped_fk :clinic_encounter_participants, [ :practice_id, :patient_id, :encounter_id ], :clinic_encounters, [ :practice_id, :patient_id, :id ], "fk_participants_encounter"
    scoped_fk :clinic_encounter_participants, [ :practice_id, :membership_id ], :clinic_memberships, [ :practice_id, :id ], "fk_participants_membership"
    add_index :clinic_encounter_participants, [ :practice_id, :encounter_id, :effective_from ]
    add_index :clinic_encounter_participants, [ :practice_id, :membership_id, :effective_from ]
    add_check_constraint :clinic_encounter_participants, "effective_until IS NULL OR effective_until > effective_from", name: "clinic_participants_valid_window"
    add_check_constraint :clinic_encounter_participants, "length(trim(participation_role)) > 0", name: "clinic_participants_role_present"

    create_tenant_table :clinic_encounter_notes do |t|
      t.bigint :patient_id, null: false
      t.bigint :encounter_id, null: false
      t.integer :lock_version, null: false, default: 0
    end
    scoped_fk :clinic_encounter_notes, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_encounter_notes_patient"
    scoped_fk :clinic_encounter_notes, [ :practice_id, :patient_id, :encounter_id ], :clinic_encounters, [ :practice_id, :patient_id, :id ], "fk_encounter_notes_encounter"
    add_check_constraint :clinic_encounter_notes, "lock_version >= 0", name: "clinic_encounter_notes_lock_version"

    create_tenant_table :clinic_encounter_note_revisions do |t|
      t.bigint :note_id, null: false
      t.integer :revision_no, null: false
      t.bigint :prior_revision_id
      t.bigint :author_membership_id, null: false
      t.text :encrypted_body, null: false
      t.integer :payload_version, null: false
    end
    add_index :clinic_encounter_note_revisions, [ :practice_id, :note_id, :id ], unique: true, name: "clinic_note_revisions_practice_note_id"
    scoped_fk :clinic_encounter_note_revisions, [ :practice_id, :note_id ], :clinic_encounter_notes, [ :practice_id, :id ], "fk_note_revisions_note"
    scoped_fk :clinic_encounter_note_revisions, [ :practice_id, :author_membership_id ], :clinic_memberships, [ :practice_id, :id ], "fk_note_revisions_author"
    scoped_fk :clinic_encounter_note_revisions, [ :practice_id, :note_id, :prior_revision_id ], :clinic_encounter_note_revisions, [ :practice_id, :note_id, :id ], "fk_note_revisions_predecessor"
    add_index :clinic_encounter_note_revisions, [ :practice_id, :note_id, :revision_no ], unique: true, name: "clinic_note_revisions_number"
    add_check_constraint :clinic_encounter_note_revisions, "revision_no > 0 AND payload_version > 0 AND (prior_revision_id IS NULL OR prior_revision_id <> id)", name: "clinic_note_revisions_values"

    create_tenant_table :clinic_encounter_note_signatures do |t|
      t.bigint :note_id, null: false
      t.bigint :revision_id, null: false
      t.bigint :signer_membership_id, null: false
      t.string :content_digest, null: false
      t.string :attestation_version, null: false
      t.column :signed_at, "timestamp(6) with time zone", null: false
    end
    scoped_fk :clinic_encounter_note_signatures, [ :practice_id, :note_id ], :clinic_encounter_notes, [ :practice_id, :id ], "fk_note_signatures_note"
    scoped_fk :clinic_encounter_note_signatures, [ :practice_id, :note_id, :revision_id ], :clinic_encounter_note_revisions, [ :practice_id, :note_id, :id ], "fk_note_signatures_revision"
    scoped_fk :clinic_encounter_note_signatures, [ :practice_id, :signer_membership_id ], :clinic_memberships, [ :practice_id, :id ], "fk_note_signatures_signer"
    add_index :clinic_encounter_note_signatures, [ :practice_id, :note_id, :revision_id, :signer_membership_id ], unique: true, name: "clinic_note_signatures_identity"
    add_check_constraint :clinic_encounter_note_signatures, "length(trim(content_digest)) > 0 AND length(trim(attestation_version)) > 0", name: "clinic_note_signatures_fields_present"

    create_patient_record_table :clinic_observations do |t|
      t.bigint :encounter_id
      t.bigint :author_membership_id, null: false
      t.bigint :parent_observation_id
      t.string :code, null: false
      t.string :code_system, null: false
      t.string :code_version, null: false
      t.string :value_kind, null: false
      t.decimal :numeric_value, precision: 30, scale: 10
      t.text :text_value
      t.text :coded_value
      t.string :unit_code
      t.string :missing_reason
      t.column :observed_at, "timestamp(6) with time zone", null: false
      t.column :recorded_at, "timestamp(6) with time zone", null: false
    end
    add_index :clinic_observations, [ :practice_id, :patient_id, :observed_at ]
    add_index :clinic_observations, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_observations_patient_id"
    scoped_fk :clinic_observations, [ :practice_id, :patient_id, :encounter_id ], :clinic_encounters, [ :practice_id, :patient_id, :id ], "fk_observations_encounter"
    scoped_fk :clinic_observations, [ :practice_id, :author_membership_id ], :clinic_memberships, [ :practice_id, :id ], "fk_observations_author"
    scoped_fk :clinic_observations, [ :practice_id, :patient_id, :parent_observation_id ], :clinic_observations, [ :practice_id, :patient_id, :id ], "fk_observations_parent"
    add_check_constraint :clinic_observations, "value_kind IN ('numeric','text','coded','missing','group')", name: "clinic_observations_value_kind"
    add_check_constraint :clinic_observations, <<~SQL.squish, name: "clinic_observations_value_shape"
      (value_kind = 'numeric' AND numeric_value IS NOT NULL AND text_value IS NULL AND coded_value IS NULL AND unit_code IS NOT NULL AND missing_reason IS NULL)
      OR (value_kind = 'text' AND numeric_value IS NULL AND text_value IS NOT NULL AND coded_value IS NULL AND unit_code IS NULL AND missing_reason IS NULL)
      OR (value_kind = 'coded' AND numeric_value IS NULL AND text_value IS NULL AND coded_value IS NOT NULL AND unit_code IS NULL AND missing_reason IS NULL)
      OR (value_kind = 'missing' AND numeric_value IS NULL AND text_value IS NULL AND coded_value IS NULL AND unit_code IS NULL AND missing_reason IS NOT NULL)
      OR (value_kind = 'group' AND numeric_value IS NULL AND text_value IS NULL AND coded_value IS NULL AND unit_code IS NULL AND missing_reason IS NULL)
    SQL
    add_check_constraint :clinic_observations, "numeric_value IS NULL OR numeric_value <> 'NaN'::numeric", name: "clinic_observations_finite_numeric"

    create_tenant_table :clinic_observation_sources do |t|
      t.bigint :patient_id, null: false
      t.bigint :derived_observation_id, null: false
      t.bigint :source_observation_id, null: false
      t.string :formula_version, null: false
    end
    scoped_fk :clinic_observation_sources, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_observation_sources_patient"
    scoped_fk :clinic_observation_sources, [ :practice_id, :patient_id, :derived_observation_id ], :clinic_observations, [ :practice_id, :patient_id, :id ], "fk_observation_sources_derived"
    scoped_fk :clinic_observation_sources, [ :practice_id, :patient_id, :source_observation_id ], :clinic_observations, [ :practice_id, :patient_id, :id ], "fk_observation_sources_source"
    add_index :clinic_observation_sources, [ :practice_id, :derived_observation_id, :source_observation_id ], unique: true, name: "clinic_observation_sources_identity"
    add_check_constraint :clinic_observation_sources, "derived_observation_id <> source_observation_id AND length(trim(formula_version)) > 0", name: "clinic_observation_sources_values"

    create_patient_record_table :clinic_conditions
    create_patient_record_table :clinic_allergies
    create_patient_record_table :clinic_medication_statements

    create_table :role_versions do |t|
      t.string :role_code, null: false
      t.integer :version, null: false
      t.timestamps
    end
    add_index :role_versions, [ :role_code, :version ], unique: true, name: "role_versions_code_version"
    add_check_constraint :role_versions, "length(trim(role_code)) > 0 AND version > 0", name: "role_versions_values"

    create_table :permissions do |t|
      t.string :action_code, null: false
      t.timestamps
    end
    add_index :permissions, :action_code, unique: true, name: "permissions_action_code"
    add_check_constraint :permissions, "length(trim(action_code)) > 0", name: "permissions_action_code_present"

    create_table :role_version_permissions do |t|
      t.bigint :role_version_id, null: false
      t.bigint :permission_id, null: false
      t.timestamps
    end
    add_foreign_key :role_version_permissions, :role_versions, name: "fk_role_version_permissions_role"
    add_foreign_key :role_version_permissions, :permissions, name: "fk_role_version_permissions_permission"
    add_index :role_version_permissions, [ :role_version_id, :permission_id ], unique: true, name: "role_version_permissions_identity"

    create_tenant_table :clinic_role_grants do |t|
      t.bigint :membership_id, null: false
      t.bigint :role_version_id, null: false
      t.string :scope_kind, null: false
      t.bigint :site_id
      t.integer :revision, null: false, default: 1
      t.column :effective_from, "timestamp(6) with time zone", null: false
      t.column :effective_until, "timestamp(6) with time zone"
      t.column :revoked_at, "timestamp(6) with time zone"
    end
    scoped_fk :clinic_role_grants, [ :practice_id, :membership_id ], :clinic_memberships, [ :practice_id, :id ], "fk_role_grants_membership"
    scoped_fk :clinic_role_grants, [ :practice_id, :site_id ], :clinic_sites, [ :practice_id, :id ], "fk_role_grants_site"
    add_foreign_key :clinic_role_grants, :role_versions, name: "fk_role_grants_role_version"
    add_index :clinic_role_grants, [ :practice_id, :membership_id, :effective_from ]
    execute <<~SQL
      CREATE UNIQUE INDEX clinic_role_grants_practice_scope_identity
        ON clinic_role_grants (practice_id, membership_id, role_version_id, scope_kind)
        WHERE site_id IS NULL;
      CREATE UNIQUE INDEX clinic_role_grants_site_scope_identity
        ON clinic_role_grants (practice_id, membership_id, role_version_id, scope_kind, site_id)
        WHERE site_id IS NOT NULL;
    SQL
    add_check_constraint :clinic_role_grants, "(scope_kind = 'practice' AND site_id IS NULL) OR (scope_kind = 'site' AND site_id IS NOT NULL)", name: "clinic_role_grants_scope"
    add_check_constraint :clinic_role_grants, "revision > 0 AND (effective_until IS NULL OR effective_until > effective_from)", name: "clinic_role_grants_window"

    create_tenant_table :clinic_role_grant_events do |t|
      t.bigint :grant_id, null: false
      t.bigint :grantor_membership_id, null: false
      t.integer :grant_revision, null: false
      t.string :event_kind, null: false
    end
    scoped_fk :clinic_role_grant_events, [ :practice_id, :grant_id ], :clinic_role_grants, [ :practice_id, :id ], "fk_role_grant_events_grant"
    scoped_fk :clinic_role_grant_events, [ :practice_id, :grantor_membership_id ], :clinic_memberships, [ :practice_id, :id ], "fk_role_grant_events_grantor"
    add_index :clinic_role_grant_events, [ :practice_id, :grant_id, :grant_revision ], unique: true, name: "clinic_role_grant_events_revision"
    add_check_constraint :clinic_role_grant_events, "grant_revision > 0 AND length(trim(event_kind)) > 0", name: "clinic_role_grant_events_values"

    create_tenant_table :clinic_audit_events do |t|
      t.string :actor_session_reference, null: false
      t.string :action_code, null: false
      t.string :outcome, null: false
      t.string :policy_version, null: false
      t.column :occurred_at, "timestamp(6) with time zone", null: false
    end
    add_index :clinic_audit_events, [ :practice_id, :occurred_at, :id ], name: "clinic_audit_events_time"
    add_index :clinic_audit_events, [ :practice_id, :actor_session_reference, :occurred_at ]
    add_check_constraint :clinic_audit_events, "outcome IN ('attempted','denied','prepared','committed','released','failed') AND length(trim(action_code)) > 0 AND length(trim(policy_version)) > 0", name: "clinic_audit_events_values"

    create_tenant_table :clinic_audit_resource_manifests do |t|
      t.bigint :audit_event_id, null: false
      t.string :protected_resource_version_ref, null: false
    end
    scoped_fk :clinic_audit_resource_manifests, [ :practice_id, :audit_event_id ], :clinic_audit_events, [ :practice_id, :id ], "fk_audit_manifests_event"
    add_index :clinic_audit_resource_manifests, [ :practice_id, :audit_event_id, :protected_resource_version_ref ], unique: true, name: "clinic_audit_manifests_identity"
    add_check_constraint :clinic_audit_resource_manifests, "length(trim(protected_resource_version_ref)) > 0", name: "clinic_audit_manifests_ref_present"

    create_tenant_table :clinic_audit_delivery_receipts do |t|
      t.bigint :audit_event_id, null: false
      t.string :sink_receipt_reference, null: false
      t.column :acknowledged_at, "timestamp(6) with time zone", null: false
    end
    scoped_fk :clinic_audit_delivery_receipts, [ :practice_id, :audit_event_id ], :clinic_audit_events, [ :practice_id, :id ], "fk_audit_receipts_event"
    add_index :clinic_audit_delivery_receipts, [ :practice_id, :audit_event_id, :sink_receipt_reference ], unique: true, name: "clinic_audit_receipts_identity"
    add_check_constraint :clinic_audit_delivery_receipts, "length(trim(sink_receipt_reference)) > 0", name: "clinic_audit_receipts_ref_present"

    create_table :platform_audit_events do |t|
      t.string :actor_session_reference, null: false
      t.string :action_code, null: false
      t.string :outcome, null: false
      t.column :occurred_at, "timestamp(6) with time zone", null: false
      t.timestamps
    end
    add_index :platform_audit_events, [ :actor_session_reference, :occurred_at ]
    add_check_constraint :platform_audit_events, "length(trim(action_code)) > 0", name: "platform_audit_events_values"

    add_column :clinic_patients, :primary_address_version_id, :bigint
    add_column :clinic_staff_members, :primary_address_version_id, :bigint
    add_column :clinic_inventory_suppliers, :primary_address_version_id, :bigint

    create_tenant_table :clinic_patient_address_versions do |t|
      t.bigint :patient_id, null: false
      t.integer :version, null: false
      t.text :encrypted_address, null: false
    end
    scoped_fk :clinic_patient_address_versions, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_patient_addresses_patient"
    add_index :clinic_patient_address_versions, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_patient_addresses_owner_id"
    add_index :clinic_patient_address_versions, [ :practice_id, :patient_id, :version ], unique: true, name: "clinic_patient_addresses_version"
    add_check_constraint :clinic_patient_address_versions, "version > 0", name: "clinic_patient_addresses_version_positive"

    create_tenant_table :clinic_staff_address_versions do |t|
      t.bigint :staff_member_id, null: false
      t.integer :version, null: false
      t.text :encrypted_address, null: false
    end
    scoped_fk :clinic_staff_address_versions, [ :practice_id, :staff_member_id ], :clinic_staff_members, [ :practice_id, :id ], "fk_staff_addresses_staff"
    add_index :clinic_staff_address_versions, [ :practice_id, :staff_member_id, :id ], unique: true, name: "clinic_staff_addresses_owner_id"
    add_index :clinic_staff_address_versions, [ :practice_id, :staff_member_id, :version ], unique: true, name: "clinic_staff_addresses_version"
    add_check_constraint :clinic_staff_address_versions, "version > 0", name: "clinic_staff_addresses_version_positive"

    create_tenant_table :clinic_supplier_address_versions do |t|
      t.bigint :supplier_id, null: false
      t.integer :version, null: false
      t.text :encrypted_address, null: false
    end
    scoped_fk :clinic_supplier_address_versions, [ :practice_id, :supplier_id ], :clinic_inventory_suppliers, [ :practice_id, :id ], "fk_supplier_addresses_supplier"
    add_index :clinic_supplier_address_versions, [ :practice_id, :supplier_id, :id ], unique: true, name: "clinic_supplier_addresses_owner_id"
    add_index :clinic_supplier_address_versions, [ :practice_id, :supplier_id, :version ], unique: true, name: "clinic_supplier_addresses_version"
    add_check_constraint :clinic_supplier_address_versions, "version > 0", name: "clinic_supplier_addresses_version_positive"

    scoped_fk :clinic_patients, [ :practice_id, :id, :primary_address_version_id ], :clinic_patient_address_versions, [ :practice_id, :patient_id, :id ], "fk_patients_primary_address"
    scoped_fk :clinic_staff_members, [ :practice_id, :id, :primary_address_version_id ], :clinic_staff_address_versions, [ :practice_id, :staff_member_id, :id ], "fk_staff_primary_address"
    scoped_fk :clinic_inventory_suppliers, [ :practice_id, :id, :primary_address_version_id ], :clinic_supplier_address_versions, [ :practice_id, :supplier_id, :id ], "fk_suppliers_primary_address"

    create_tenant_table :clinic_document_categories do |t|
      t.string :code, null: false
      t.string :name, null: false
    end
    add_index :clinic_document_categories, [ :practice_id, :code ], unique: true, name: "clinic_document_categories_code"
    add_check_constraint :clinic_document_categories, "length(trim(code)) > 0 AND length(trim(name)) > 0", name: "clinic_document_categories_values"

    create_tenant_table :clinic_documents do |t|
      t.bigint :patient_id, null: false
      t.bigint :encounter_id
      t.bigint :category_id, null: false
      t.string :object_key, null: false
      t.string :object_version, null: false
      t.string :checksum, null: false
      t.bigint :byte_size, null: false
      t.string :media_type, null: false
      t.string :scan_state, null: false
    end
    scoped_fk :clinic_documents, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_documents_patient"
    scoped_fk :clinic_documents, [ :practice_id, :patient_id, :encounter_id ], :clinic_encounters, [ :practice_id, :patient_id, :id ], "fk_documents_encounter"
    scoped_fk :clinic_documents, [ :practice_id, :category_id ], :clinic_document_categories, [ :practice_id, :id ], "fk_documents_category"
    add_index :clinic_documents, [ :practice_id, :object_key, :object_version ], unique: true, name: "clinic_documents_object_identity"
    add_index :clinic_documents, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_documents_patient_id"
    add_index :clinic_documents, [ :practice_id, :patient_id, :created_at ]
    add_check_constraint :clinic_documents, "byte_size >= 0 AND length(trim(object_key)) > 0 AND length(trim(object_version)) > 0 AND length(trim(checksum)) > 0 AND length(trim(media_type)) > 0", name: "clinic_documents_values"
    add_check_constraint :clinic_documents, "scan_state IN ('pending','quarantined','clean','rejected')", name: "clinic_documents_scan_state"

    create_tenant_table :clinic_message_intents do |t|
      t.bigint :patient_id, null: false
      t.string :request_key, null: false
      t.string :purpose_code, null: false
      t.text :encrypted_recipient_snapshot, null: false
      t.text :encrypted_content, null: false
    end
    scoped_fk :clinic_message_intents, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_message_intents_patient"
    add_index :clinic_message_intents, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_message_intents_patient_id"
    add_index :clinic_message_intents, [ :practice_id, :request_key ], unique: true, name: "clinic_message_intents_request"
    add_check_constraint :clinic_message_intents, "length(trim(request_key)) > 0 AND length(trim(purpose_code)) > 0", name: "clinic_message_intents_values"

    create_tenant_table :clinic_message_attachments do |t|
      t.bigint :patient_id, null: false
      t.bigint :message_intent_id, null: false
      t.bigint :document_id, null: false
    end
    scoped_fk :clinic_message_attachments, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_message_attachments_patient"
    scoped_fk :clinic_message_attachments, [ :practice_id, :patient_id, :message_intent_id ], :clinic_message_intents, [ :practice_id, :patient_id, :id ], "fk_message_attachments_intent"
    scoped_fk :clinic_message_attachments, [ :practice_id, :patient_id, :document_id ], :clinic_documents, [ :practice_id, :patient_id, :id ], "fk_message_attachments_document"
    add_index :clinic_message_attachments, [ :practice_id, :message_intent_id, :document_id ], unique: true, name: "clinic_message_attachments_identity"

    create_tenant_table :clinic_message_outbox do |t|
      t.bigint :message_intent_id, null: false
      t.string :dispatch_state, null: false
      t.integer :lock_version, null: false, default: 0
    end
    scoped_fk :clinic_message_outbox, [ :practice_id, :message_intent_id ], :clinic_message_intents, [ :practice_id, :id ], "fk_message_outbox_intent"
    add_index :clinic_message_outbox, [ :practice_id, :message_intent_id ], unique: true, name: "clinic_message_outbox_one_per_intent"
    add_check_constraint :clinic_message_outbox, "lock_version >= 0 AND length(trim(dispatch_state)) > 0", name: "clinic_message_outbox_values"

    create_tenant_table :clinic_message_delivery_events do |t|
      t.bigint :message_intent_id, null: false
      t.string :provider_event_reference, null: false
      t.string :outcome, null: false
    end
    scoped_fk :clinic_message_delivery_events, [ :practice_id, :message_intent_id ], :clinic_message_intents, [ :practice_id, :id ], "fk_message_delivery_intent"
    add_index :clinic_message_delivery_events, [ :practice_id, :message_intent_id, :provider_event_reference ], unique: true, name: "clinic_message_delivery_identity"
    add_check_constraint :clinic_message_delivery_events, "length(trim(provider_event_reference)) > 0 AND length(trim(outcome)) > 0", name: "clinic_message_delivery_values"

    create_tenant_table :clinic_invoices do |t|
      t.bigint :patient_id, null: false
      t.string :currency, null: false
      t.string :status, null: false
      t.string :rounding_policy_version, null: false
    end
    scoped_fk :clinic_invoices, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_invoices_patient"
    add_index :clinic_invoices, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_invoices_patient_id"
    add_index :clinic_invoices, [ :practice_id, :patient_id, :created_at ]
    add_check_constraint :clinic_invoices, "currency ~ '^[A-Z]{3}$' AND length(trim(status)) > 0 AND length(trim(rounding_policy_version)) > 0", name: "clinic_invoices_values"

    create_tenant_table :clinic_invoice_lines do |t|
      t.bigint :patient_id, null: false
      t.bigint :invoice_id, null: false
      t.decimal :quantity, precision: 20, scale: 6, null: false
      t.decimal :unit_amount, precision: 20, scale: 6, null: false
      t.decimal :posted_amount, precision: 20, scale: 6, null: false
      t.text :description_snapshot, null: false
    end
    scoped_fk :clinic_invoice_lines, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_invoice_lines_patient"
    scoped_fk :clinic_invoice_lines, [ :practice_id, :patient_id, :invoice_id ], :clinic_invoices, [ :practice_id, :patient_id, :id ], "fk_invoice_lines_invoice"
    add_index :clinic_invoice_lines, [ :practice_id, :invoice_id, :id ]
    add_check_constraint :clinic_invoice_lines, "quantity > 0 AND unit_amount >= 0 AND posted_amount >= 0 AND length(trim(description_snapshot)) > 0", name: "clinic_invoice_lines_values"

    create_tenant_table :clinic_payment_events do |t|
      t.bigint :patient_id, null: false
      t.string :currency, null: false
      t.decimal :amount, precision: 20, scale: 6, null: false
      t.string :external_event_reference, null: false
    end
    scoped_fk :clinic_payment_events, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_payment_events_patient"
    add_index :clinic_payment_events, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_payment_events_patient_id"
    add_index :clinic_payment_events, [ :practice_id, :external_event_reference ], unique: true, name: "clinic_payment_events_external_ref"
    add_check_constraint :clinic_payment_events, "currency ~ '^[A-Z]{3}$' AND amount > 0 AND length(trim(external_event_reference)) > 0", name: "clinic_payment_events_values"

    create_tenant_table :clinic_payment_allocations do |t|
      t.bigint :patient_id, null: false
      t.bigint :payment_event_id, null: false
      t.bigint :invoice_id, null: false
      t.decimal :amount, precision: 20, scale: 6, null: false
    end
    scoped_fk :clinic_payment_allocations, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_payment_allocations_patient"
    scoped_fk :clinic_payment_allocations, [ :practice_id, :patient_id, :payment_event_id ], :clinic_payment_events, [ :practice_id, :patient_id, :id ], "fk_payment_allocations_payment"
    scoped_fk :clinic_payment_allocations, [ :practice_id, :patient_id, :invoice_id ], :clinic_invoices, [ :practice_id, :patient_id, :id ], "fk_payment_allocations_invoice"
    add_index :clinic_payment_allocations, [ :practice_id, :payment_event_id ]
    add_index :clinic_payment_allocations, [ :practice_id, :invoice_id ]
    add_check_constraint :clinic_payment_allocations, "amount > 0", name: "clinic_payment_allocations_amount"

    create_tenant_table :clinic_credit_notes do |t|
      t.bigint :patient_id, null: false
      t.bigint :invoice_id, null: false
      t.string :currency, null: false
      t.decimal :amount, precision: 20, scale: 6, null: false
    end
    scoped_fk :clinic_credit_notes, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_credit_notes_patient"
    scoped_fk :clinic_credit_notes, [ :practice_id, :patient_id, :invoice_id ], :clinic_invoices, [ :practice_id, :patient_id, :id ], "fk_credit_notes_invoice"
    add_check_constraint :clinic_credit_notes, "currency ~ '^[A-Z]{3}$' AND amount > 0", name: "clinic_credit_notes_values"

    create_tenant_table :clinic_refund_events do |t|
      t.bigint :patient_id, null: false
      t.bigint :payment_event_id, null: false
      t.string :currency, null: false
      t.decimal :amount, precision: 20, scale: 6, null: false
    end
    scoped_fk :clinic_refund_events, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_refund_events_patient"
    scoped_fk :clinic_refund_events, [ :practice_id, :patient_id, :payment_event_id ], :clinic_payment_events, [ :practice_id, :patient_id, :id ], "fk_refund_events_payment"
    add_check_constraint :clinic_refund_events, "currency ~ '^[A-Z]{3}$' AND amount > 0", name: "clinic_refund_events_values"

    create_tenant_table :clinic_coverage_versions do |t|
      t.bigint :patient_id, null: false
      t.integer :version, null: false
      t.text :encrypted_coverage_evidence, null: false
    end
    scoped_fk :clinic_coverage_versions, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_coverage_versions_patient"
    add_index :clinic_coverage_versions, [ :practice_id, :patient_id, :id ], unique: true, name: "clinic_coverage_versions_patient_id"
    add_index :clinic_coverage_versions, [ :practice_id, :patient_id, :version ], unique: true, name: "clinic_coverage_versions_identity"
    add_check_constraint :clinic_coverage_versions, "version > 0", name: "clinic_coverage_versions_version_positive"

    create_tenant_table :clinic_insurance_claims do |t|
      t.bigint :patient_id, null: false
      t.bigint :invoice_id, null: false
      t.bigint :coverage_version_id, null: false
    end
    scoped_fk :clinic_insurance_claims, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_insurance_claims_patient"
    scoped_fk :clinic_insurance_claims, [ :practice_id, :patient_id, :invoice_id ], :clinic_invoices, [ :practice_id, :patient_id, :id ], "fk_insurance_claims_invoice"
    scoped_fk :clinic_insurance_claims, [ :practice_id, :patient_id, :coverage_version_id ], :clinic_coverage_versions, [ :practice_id, :patient_id, :id ], "fk_insurance_claims_coverage"
    add_index :clinic_insurance_claims, [ :practice_id, :invoice_id ]

    enable_extension "btree_gist"
    execute <<~SQL
      ALTER TABLE clinic_appointments
        ADD CONSTRAINT clinic_appointments_no_provider_overlap
        EXCLUDE USING gist (
          practice_id WITH =,
          booked_clinician_id WITH =,
          tstzrange(starts_at, ends_at, '[)') WITH &&
        )
        WHERE (booked_clinician_id IS NOT NULL);
      ALTER TABLE clinic_appointments
        ADD CONSTRAINT clinic_appointments_no_room_overlap
        EXCLUDE USING gist (
          practice_id WITH =,
          room_id WITH =,
          tstzrange(starts_at, ends_at, '[)') WITH &&
        )
        WHERE (room_id IS NOT NULL);
    SQL

    install_immutable_triggers
  end

  def down
    raise ActiveRecord::IrreversibleMigration, "The approved ERD migration preserves history; restore a verified backup for rollback."
  end

  private

  def create_tenant_table(name)
    create_table name do |t|
      t.bigint :practice_id, null: false
      yield t
      t.timestamps
    end
    add_index name, [ :practice_id, :id ], unique: true, name: "#{name}_practice_id"
    add_foreign_key name, :clinic_practices, column: :practice_id, name: "fk_#{name}_practice"
  end

  def create_patient_record_table(name)
    create_tenant_table name do |t|
      t.bigint :patient_id, null: false
      yield t if block_given?
    end
    scoped_fk name, [ :practice_id, :patient_id ], :clinic_patients, [ :practice_id, :id ], "fk_#{name}_patient"
    add_index name, [ :practice_id, :patient_id, :created_at ], name: "#{name}_patient_time"
  end

  def scoped_fk(table, columns, target, primary_key, name)
    add_foreign_key table, target, column: columns, primary_key: primary_key, name: name
  end

  def install_immutable_triggers
    execute <<~SQL
      CREATE FUNCTION erd_immutable_record() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'This record is append-only';
      END;
      $$;
    SQL

    %w[
      role_versions
      permissions
      role_version_permissions
      clinic_role_grant_events
      clinic_audit_events
      clinic_audit_resource_manifests
      clinic_audit_delivery_receipts
      platform_audit_events
      clinic_patient_address_versions
      clinic_staff_address_versions
      clinic_supplier_address_versions
      clinic_encounter_note_revisions
      clinic_encounter_note_signatures
      clinic_observation_sources
      clinic_payment_events
      clinic_payment_allocations
      clinic_credit_notes
      clinic_refund_events
      clinic_coverage_versions
    ].each do |table|
      execute "CREATE TRIGGER #{table}_immutable BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
    end
  end
end
