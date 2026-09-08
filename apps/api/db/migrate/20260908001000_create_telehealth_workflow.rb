class CreateTelehealthWorkflow < ActiveRecord::Migration[8.1]
  def change
    add_column :clinic_appointments, :visit_modality, :string, null: false, default: "in_person", limit: 16
    add_check_constraint :clinic_appointments, "visit_modality IN ('in_person','video') AND (visit_modality <> 'video' OR room_id IS NULL)",
      name: "clinic_appointments_visit_modality"
    add_column :clinic_patient_portal_appointment_requests, :requested_modality, :string, limit: 16
    add_check_constraint :clinic_patient_portal_appointment_requests,
      "requested_modality IS NULL OR requested_modality IN ('in_person','video')",
      name: "clinic_portal_requests_modality"

    create_table :clinic_telehealth_settings do |t|
      t.bigint :practice_id, null: false
      t.string :provider_code, null: false, default: "daily", limit: 32
      t.string :provider_account_ref, limit: 128
      t.boolean :enabled, null: false, default: false
      t.bigint :active_policy_version_id
      t.string :health_status, null: false, default: "not_checked", limit: 24
      t.datetime :health_checked_at
      t.string :last_error_code, limit: 80
      t.bigint :updated_by_membership_id, null: false
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_telehealth_settings
    tenant_fk :clinic_telehealth_settings, :updated_by_membership_id, :clinic_memberships
    add_index :clinic_telehealth_settings, :practice_id, unique: true, name: "idx_telehealth_one_setting_per_practice"
    add_check_constraint :clinic_telehealth_settings,
      "provider_code = 'daily' AND health_status IN ('not_checked','ready','degraded','unconfigured')",
      name: "telehealth_settings_values"

    create_table :clinic_telehealth_policy_versions do |t|
      t.bigint :practice_id, null: false
      t.bigint :settings_id, null: false
      t.integer :version, null: false
      t.string :status, null: false, default: "draft", limit: 16
      t.string :consent_title, null: false, limit: 160
      t.text :consent_body, null: false
      t.string :content_digest, null: false, limit: 64
      t.string :locale, null: false, limit: 20
      t.text :patient_instructions, null: false
      t.string :support_label, null: false, limit: 120
      t.string :support_phone, limit: 32
      t.text :support_url
      t.integer :join_early_minutes, null: false
      t.integer :join_late_minutes, null: false
      t.integer :max_room_minutes, null: false
      t.integer :grant_ttl_seconds, null: false
      t.integer :checkin_max_age_minutes, null: false
      t.boolean :allow_audio_only, null: false, default: false
      t.boolean :allow_staff_screen_share, null: false, default: true
      t.boolean :scribe_enabled, null: false, default: false
      t.boolean :require_location, null: false, default: true
      t.boolean :require_callback, null: false, default: true
      t.string :scribe_consent_title, limit: 160
      t.text :scribe_consent_body
      t.string :scribe_consent_digest, limit: 64
      t.bigint :created_by_membership_id, null: false
      t.bigint :published_by_membership_id
      t.datetime :published_at
      t.datetime :retired_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_telehealth_policy_versions
    tenant_fk :clinic_telehealth_policy_versions, :settings_id, :clinic_telehealth_settings
    tenant_fk :clinic_telehealth_policy_versions, :created_by_membership_id, :clinic_memberships
    tenant_fk :clinic_telehealth_policy_versions, :published_by_membership_id, :clinic_memberships
    add_index :clinic_telehealth_policy_versions, [ :practice_id, :settings_id, :version ], unique: true,
      name: "idx_telehealth_policy_version"
    add_check_constraint :clinic_telehealth_policy_versions, <<~SQL.squish, name: "telehealth_policy_values"
      version > 0 AND status IN ('draft','published','retired') AND length(content_digest) = 64 AND
      join_early_minutes BETWEEN 0 AND 120 AND join_late_minutes BETWEEN 0 AND 120 AND
      max_room_minutes BETWEEN 5 AND 240 AND grant_ttl_seconds BETWEEN 30 AND 300 AND
      checkin_max_age_minutes BETWEEN 5 AND 1440 AND
      ((scribe_consent_title IS NULL AND scribe_consent_body IS NULL AND scribe_consent_digest IS NULL AND scribe_enabled = false) OR
       (scribe_consent_title IS NOT NULL AND scribe_consent_body IS NOT NULL AND length(scribe_consent_digest) = 64)) AND
      ((status = 'draft' AND published_at IS NULL AND published_by_membership_id IS NULL) OR
       (status IN ('published','retired') AND published_at IS NOT NULL AND published_by_membership_id IS NOT NULL))
    SQL
    add_foreign_key :clinic_telehealth_settings, :clinic_telehealth_policy_versions,
      column: [ :practice_id, :active_policy_version_id ], primary_key: [ :practice_id, :id ]

    create_table :clinic_telehealth_visit_type_rules do |t|
      t.bigint :practice_id, null: false
      t.bigint :visit_type_id, null: false
      t.bigint :site_id
      t.boolean :enabled, null: false, default: false
      t.jsonb :allowed_region_codes, null: false, default: []
      t.integer :min_patient_age_years
      t.integer :max_patient_age_years
      t.bigint :updated_by_membership_id, null: false
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_telehealth_visit_type_rules
    tenant_fk :clinic_telehealth_visit_type_rules, :visit_type_id, :clinic_visit_types
    tenant_fk :clinic_telehealth_visit_type_rules, :site_id, :clinic_sites
    tenant_fk :clinic_telehealth_visit_type_rules, :updated_by_membership_id, :clinic_memberships
    add_index :clinic_telehealth_visit_type_rules, [ :practice_id, :visit_type_id ], unique: true,
      where: "site_id IS NULL", name: "idx_telehealth_rule_practice"
    add_index :clinic_telehealth_visit_type_rules, [ :practice_id, :visit_type_id, :site_id ], unique: true,
      where: "site_id IS NOT NULL", name: "idx_telehealth_rule_site"
    add_check_constraint :clinic_telehealth_visit_type_rules, <<~SQL.squish, name: "telehealth_visit_type_rule_values"
      jsonb_typeof(allowed_region_codes) = 'array' AND jsonb_array_length(allowed_region_codes) <= 250 AND
      (min_patient_age_years IS NULL OR min_patient_age_years BETWEEN 0 AND 130) AND
      (max_patient_age_years IS NULL OR max_patient_age_years BETWEEN 0 AND 130) AND
      (min_patient_age_years IS NULL OR max_patient_age_years IS NULL OR min_patient_age_years <= max_patient_age_years)
    SQL

    create_table :clinic_telehealth_visits do |t|
      t.bigint :practice_id, null: false
      t.uuid :public_id, null: false, default: -> { "gen_random_uuid()" }
      t.bigint :patient_id, null: false
      t.bigint :appointment_id, null: false
      t.bigint :encounter_id
      t.bigint :policy_version_id, null: false
      t.string :status, null: false, default: "scheduled", limit: 20
      t.integer :access_generation, null: false, default: 1
      t.bigint :current_room_attempt_id
      t.datetime :first_started_at
      t.datetime :last_ended_at
      t.bigint :ended_by_membership_id
      t.string :end_reason_code, limit: 40
      t.bigint :created_by_membership_id, null: false
      t.bigint :scribe_encounter_id
      t.bigint :scribe_capture_owner_participant_id
      t.string :scribe_capture_owner_token_digest, limit: 64
      t.integer :scribe_capture_epoch, null: false, default: 0
      t.datetime :scribe_capture_lease_expires_at
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_telehealth_visits
    tenant_fk :clinic_telehealth_visits, :patient_id, :clinic_patients
    tenant_fk :clinic_telehealth_visits, :appointment_id, :clinic_appointments
    tenant_fk :clinic_telehealth_visits, :encounter_id, :clinic_encounters
    tenant_fk :clinic_telehealth_visits, :policy_version_id, :clinic_telehealth_policy_versions
    tenant_fk :clinic_telehealth_visits, :ended_by_membership_id, :clinic_memberships
    tenant_fk :clinic_telehealth_visits, :created_by_membership_id, :clinic_memberships
    tenant_fk :clinic_telehealth_visits, :scribe_encounter_id, :clinic_scribe_encounters
    add_index :clinic_telehealth_visits, :public_id, unique: true
    add_index :clinic_telehealth_visits, [ :practice_id, :scribe_encounter_id ], unique: true,
      where: "scribe_encounter_id IS NOT NULL", name: "idx_telehealth_visit_scribe_encounter"
    add_index :clinic_telehealth_visits, [ :practice_id, :appointment_id ], unique: true
    add_index :clinic_telehealth_visits, [ :practice_id, :encounter_id ], unique: true, where: "encounter_id IS NOT NULL"
    add_index :clinic_telehealth_visits, [ :practice_id, :status, :appointment_id ]
    add_check_constraint :clinic_telehealth_visits, <<~SQL.squish, name: "telehealth_visit_values"
      status IN ('scheduled','in_progress','ending','ended','cancelled','no_show') AND access_generation > 0 AND
      scribe_capture_epoch >= 0 AND
      ((scribe_capture_owner_participant_id IS NULL AND scribe_capture_owner_token_digest IS NULL AND scribe_capture_lease_expires_at IS NULL) OR
       (scribe_capture_owner_participant_id IS NOT NULL AND length(scribe_capture_owner_token_digest) = 64 AND scribe_capture_lease_expires_at IS NOT NULL))
    SQL

    create_table :clinic_telehealth_participants do |t|
      t.bigint :practice_id, null: false
      t.bigint :visit_id, null: false
      t.string :role, null: false, limit: 24
      t.bigint :portal_identity_id
      t.bigint :membership_id
      t.uuid :provider_subject_id, null: false, default: -> { "gen_random_uuid()" }
      t.string :status, null: false, default: "eligible", limit: 24
      t.bigint :admitted_by_membership_id
      t.datetime :admitted_at
      t.integer :admitted_generation
      t.bigint :admitted_checkin_id
      t.datetime :last_seen_at
      t.datetime :revoked_at
      t.string :revocation_reason, limit: 40
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_telehealth_participants
    tenant_fk :clinic_telehealth_participants, :visit_id, :clinic_telehealth_visits
    tenant_fk :clinic_telehealth_participants, :portal_identity_id, :clinic_patient_portal_identities
    tenant_fk :clinic_telehealth_participants, :membership_id, :clinic_memberships
    tenant_fk :clinic_telehealth_participants, :admitted_by_membership_id, :clinic_memberships
    add_index :clinic_telehealth_participants, :provider_subject_id, unique: true
    add_index :clinic_telehealth_participants, [ :practice_id, :visit_id, :portal_identity_id ], unique: true,
      where: "portal_identity_id IS NOT NULL", name: "idx_telehealth_participant_identity"
    add_index :clinic_telehealth_participants, [ :practice_id, :visit_id, :membership_id ], unique: true,
      where: "membership_id IS NOT NULL", name: "idx_telehealth_participant_membership"
    add_index :clinic_telehealth_participants, [ :practice_id, :visit_id ], unique: true,
      where: "role = 'patient'", name: "idx_telehealth_one_patient_participant"
    add_check_constraint :clinic_telehealth_participants, <<~SQL.squish, name: "telehealth_participant_values"
      role IN ('patient','clinician','assistant') AND status IN ('eligible','waiting','admitted','left','removed') AND
      ((role = 'patient' AND portal_identity_id IS NOT NULL AND membership_id IS NULL) OR
       (role IN ('clinician','assistant') AND portal_identity_id IS NULL AND membership_id IS NOT NULL)) AND
      ((status = 'admitted' AND admitted_at IS NOT NULL AND admitted_generation IS NOT NULL) OR status <> 'admitted')
    SQL

    create_table :clinic_telehealth_checkins do |t|
      t.bigint :practice_id, null: false
      t.bigint :visit_id, null: false
      t.bigint :participant_id, null: false
      t.integer :sequence, null: false
      t.integer :access_generation, null: false
      t.text :location_payload
      t.text :callback_phone
      t.boolean :location_attested, null: false
      t.jsonb :device_results, null: false, default: {}
      t.datetime :submitted_at, null: false
      t.bigint :supersedes_checkin_id
      t.datetime :created_at, null: false
    end
    tenant_identity :clinic_telehealth_checkins
    tenant_fk :clinic_telehealth_checkins, :visit_id, :clinic_telehealth_visits
    tenant_fk :clinic_telehealth_checkins, :participant_id, :clinic_telehealth_participants
    tenant_fk :clinic_telehealth_checkins, :supersedes_checkin_id, :clinic_telehealth_checkins
    add_index :clinic_telehealth_checkins, [ :practice_id, :visit_id, :sequence ], unique: true
    add_check_constraint :clinic_telehealth_checkins,
      "sequence > 0 AND access_generation > 0 AND jsonb_typeof(device_results) = 'object'",
      name: "telehealth_checkin_values"

    create_table :clinic_telehealth_consents do |t|
      t.bigint :practice_id, null: false
      t.bigint :visit_id, null: false
      t.bigint :participant_id, null: false
      t.bigint :policy_version_id, null: false
      t.string :purpose, null: false, default: "telehealth", limit: 24
      t.string :decision, null: false, limit: 16
      t.integer :sequence, null: false
      t.datetime :decided_at, null: false
      t.string :method, null: false, default: "portal_authenticated", limit: 24
      t.string :policy_content_digest, null: false, limit: 64
      t.bigint :supersedes_consent_id
      t.datetime :created_at, null: false
    end
    tenant_identity :clinic_telehealth_consents
    tenant_fk :clinic_telehealth_consents, :visit_id, :clinic_telehealth_visits
    tenant_fk :clinic_telehealth_consents, :participant_id, :clinic_telehealth_participants
    tenant_fk :clinic_telehealth_consents, :policy_version_id, :clinic_telehealth_policy_versions
    tenant_fk :clinic_telehealth_consents, :supersedes_consent_id, :clinic_telehealth_consents
    add_index :clinic_telehealth_consents, [ :practice_id, :visit_id, :participant_id, :purpose, :sequence ],
      unique: true, name: "idx_telehealth_consent_sequence"
    add_check_constraint :clinic_telehealth_consents, <<~SQL.squish, name: "telehealth_consent_values"
      purpose IN ('telehealth','scribe_recording') AND decision IN ('accepted','declined','withdrawn') AND sequence > 0 AND
      method IN ('portal_authenticated','staff_authenticated') AND length(policy_content_digest) = 64
    SQL

    add_foreign_key :clinic_telehealth_participants, :clinic_telehealth_checkins,
      column: [ :practice_id, :admitted_checkin_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_telehealth_visits, :clinic_telehealth_participants,
      column: [ :practice_id, :scribe_capture_owner_participant_id ], primary_key: [ :practice_id, :id ]

    create_table :clinic_telehealth_room_attempts do |t|
      t.bigint :practice_id, null: false
      t.bigint :visit_id, null: false
      t.integer :attempt_no, null: false
      t.string :provider_code, null: false, limit: 32
      t.string :provider_account_ref, null: false, limit: 128
      t.string :provider_room_name, null: false, limit: 128
      t.text :provider_room_url
      t.string :status, null: false, default: "pending", limit: 24
      t.integer :access_generation, null: false
      t.datetime :provisioned_at
      t.datetime :expires_at, null: false
      t.datetime :started_at
      t.datetime :ended_at
      t.datetime :last_reconciled_at
      t.string :last_error_code, limit: 80
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_telehealth_room_attempts
    tenant_fk :clinic_telehealth_room_attempts, :visit_id, :clinic_telehealth_visits
    add_index :clinic_telehealth_room_attempts, [ :practice_id, :visit_id, :attempt_no ], unique: true,
      name: "idx_telehealth_room_attempt"
    add_index :clinic_telehealth_room_attempts, [ :provider_code, :provider_account_ref, :provider_room_name ], unique: true,
      name: "idx_telehealth_provider_room"
    add_index :clinic_telehealth_room_attempts, [ :practice_id, :visit_id ], unique: true,
      where: "status IN ('pending','provisioning','ready','active','ending','unknown')",
      name: "idx_telehealth_one_live_room"
    add_check_constraint :clinic_telehealth_room_attempts, <<~SQL.squish, name: "telehealth_room_attempt_values"
      attempt_no > 0 AND provider_code = 'daily' AND access_generation > 0 AND
      status IN ('pending','provisioning','ready','active','ending','ended','failed','unknown') AND expires_at > created_at
    SQL
    add_foreign_key :clinic_telehealth_visits, :clinic_telehealth_room_attempts,
      column: [ :practice_id, :current_room_attempt_id ], primary_key: [ :practice_id, :id ]

    create_table :clinic_telehealth_join_grants do |t|
      t.bigint :practice_id, null: false
      t.bigint :visit_id, null: false
      t.bigint :participant_id, null: false
      t.bigint :room_attempt_id, null: false
      t.integer :access_generation, null: false
      t.string :token_digest, null: false, limit: 64
      t.string :request_digest, null: false, limit: 64
      t.datetime :issued_at, null: false
      t.datetime :expires_at, null: false
      t.datetime :revoked_at
      t.string :revocation_reason, limit: 40
      t.datetime :created_at, null: false
    end
    tenant_identity :clinic_telehealth_join_grants
    tenant_fk :clinic_telehealth_join_grants, :visit_id, :clinic_telehealth_visits
    tenant_fk :clinic_telehealth_join_grants, :participant_id, :clinic_telehealth_participants
    tenant_fk :clinic_telehealth_join_grants, :room_attempt_id, :clinic_telehealth_room_attempts
    add_index :clinic_telehealth_join_grants, :token_digest, unique: true
    add_index :clinic_telehealth_join_grants,
      [ :practice_id, :participant_id, :access_generation, :request_digest ], unique: true,
      name: "idx_telehealth_join_grant_request"
    add_index :clinic_telehealth_join_grants, [ :practice_id, :visit_id, :participant_id, :expires_at ],
      name: "idx_telehealth_join_grant_expiry"
    add_check_constraint :clinic_telehealth_join_grants,
      "access_generation > 0 AND length(token_digest) = 64 AND length(request_digest) = 64 AND expires_at > issued_at",
      name: "telehealth_join_grant_values"

    create_table :clinic_telehealth_commands do |t|
      t.bigint :practice_id, null: false
      t.bigint :visit_id, null: false
      t.bigint :room_attempt_id
      t.bigint :participant_id
      t.string :kind, null: false, limit: 32
      t.datetime :requested_expires_at
      t.string :dedupe_key, null: false, limit: 160
      t.integer :access_generation, null: false
      t.string :status, null: false, default: "pending", limit: 16
      t.integer :attempt_count, null: false, default: 0
      t.datetime :available_at, null: false
      t.uuid :lease_token
      t.datetime :leased_until
      t.datetime :last_attempt_at
      t.datetime :completed_at
      t.string :last_error_code, limit: 80
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_telehealth_commands
    tenant_fk :clinic_telehealth_commands, :visit_id, :clinic_telehealth_visits
    tenant_fk :clinic_telehealth_commands, :room_attempt_id, :clinic_telehealth_room_attempts
    tenant_fk :clinic_telehealth_commands, :participant_id, :clinic_telehealth_participants
    add_index :clinic_telehealth_commands, [ :practice_id, :dedupe_key ], unique: true
    add_index :clinic_telehealth_commands, [ :status, :available_at ]
    add_check_constraint :clinic_telehealth_commands, <<~SQL.squish, name: "telehealth_command_values"
      kind IN ('create_room','end_room','extend_room','eject_participant','reconcile_room','delete_room') AND
      status IN ('pending','leased','succeeded','failed','unknown','suppressed') AND access_generation > 0 AND attempt_count >= 0 AND
      ((kind = 'extend_room' AND requested_expires_at IS NOT NULL) OR (kind <> 'extend_room' AND requested_expires_at IS NULL)) AND
      ((status = 'leased' AND lease_token IS NOT NULL AND leased_until IS NOT NULL) OR status <> 'leased')
    SQL

    create_table :clinic_telehealth_provider_events do |t|
      t.bigint :practice_id, null: false
      t.bigint :room_attempt_id, null: false
      t.bigint :participant_id
      t.string :provider_code, null: false, limit: 32
      t.string :provider_account_ref, null: false, limit: 128
      t.string :provider_event_id, null: false, limit: 160
      t.string :event_type, null: false, limit: 48
      t.string :provider_session_ref, limit: 160
      t.datetime :occurred_at, null: false
      t.datetime :received_at, null: false
      t.string :payload_digest, null: false, limit: 64
      t.jsonb :normalized_metadata, null: false, default: {}
      t.datetime :created_at, null: false
    end
    tenant_identity :clinic_telehealth_provider_events
    tenant_fk :clinic_telehealth_provider_events, :room_attempt_id, :clinic_telehealth_room_attempts
    tenant_fk :clinic_telehealth_provider_events, :participant_id, :clinic_telehealth_participants
    add_index :clinic_telehealth_provider_events,
      [ :provider_code, :provider_account_ref, :provider_event_id ], unique: true,
      name: "idx_telehealth_provider_event"
    add_check_constraint :clinic_telehealth_provider_events,
      "provider_code = 'daily' AND length(payload_digest) = 64 AND jsonb_typeof(normalized_metadata) = 'object'",
      name: "telehealth_provider_event_values"

    create_table :clinic_telehealth_patient_receipts do |t|
      t.bigint :practice_id, null: false
      t.bigint :portal_identity_id, null: false
      t.bigint :visit_id, null: false
      t.string :request_key, null: false, limit: 160
      t.string :operation_code, null: false, limit: 80
      t.string :payload_digest, null: false, limit: 64
      t.string :digest_key_id, null: false, limit: 80
      t.string :digest_algorithm, null: false, limit: 32
      t.string :outcome, null: false, limit: 24
      t.string :result_kind, null: false, limit: 24
      t.bigint :result_id
      t.integer :result_version
      t.datetime :created_at, null: false
    end
    tenant_identity :clinic_telehealth_patient_receipts
    tenant_fk :clinic_telehealth_patient_receipts, :portal_identity_id, :clinic_patient_portal_identities
    tenant_fk :clinic_telehealth_patient_receipts, :visit_id, :clinic_telehealth_visits
    add_index :clinic_telehealth_patient_receipts, [ :practice_id, :portal_identity_id, :request_key ], unique: true,
      name: "idx_telehealth_patient_receipt"
    add_check_constraint :clinic_telehealth_patient_receipts, <<~SQL.squish, name: "telehealth_patient_receipt_values"
      length(payload_digest) = 64 AND digest_algorithm = 'HMAC-SHA256' AND
      outcome IN ('committed','outcome_unconfirmed') AND
      result_kind IN ('checkin','consent','participant','visit')
    SQL

    add_column :clinic_scribe_recordings, :telehealth_visit_id, :bigint
    add_column :clinic_scribe_recordings, :capture_owner_participant_id, :bigint
    add_column :clinic_scribe_recordings, :capture_epoch, :integer
    add_column :clinic_scribe_recordings, :capture_source, :string, null: false, default: "microphone", limit: 24
    add_column :clinic_scribe_recordings, :recording_segment_index, :integer
    add_column :clinic_scribe_recordings, :source_order, :integer
    tenant_fk :clinic_scribe_recordings, :telehealth_visit_id, :clinic_telehealth_visits
    tenant_fk :clinic_scribe_recordings, :capture_owner_participant_id, :clinic_telehealth_participants
    add_index :clinic_scribe_recordings, [ :practice_id, :telehealth_visit_id ], unique: true,
      where: "telehealth_visit_id IS NOT NULL AND status = 'recording'",
      name: "idx_one_active_telehealth_recording"
    add_index :clinic_scribe_recordings,
      [ :practice_id, :telehealth_visit_id, :capture_epoch, :recording_segment_index, :source_order ], unique: true,
      where: "telehealth_visit_id IS NOT NULL", name: "idx_scribe_recordings_telehealth_provenance"
    add_check_constraint :clinic_scribe_recordings, <<~SQL.squish, name: "scribe_recordings_telehealth_values"
      capture_source IN ('microphone','telehealth_mix') AND
      ((capture_source = 'microphone' AND telehealth_visit_id IS NULL AND capture_owner_participant_id IS NULL AND capture_epoch IS NULL AND recording_segment_index IS NULL AND source_order IS NULL) OR
       (capture_source = 'telehealth_mix' AND telehealth_visit_id IS NOT NULL AND capture_owner_participant_id IS NOT NULL AND capture_epoch > 0 AND recording_segment_index >= 0 AND source_order > 0))
    SQL

    add_column :clinic_scribe_sources, :telehealth_visit_id, :bigint
    add_column :clinic_scribe_sources, :telehealth_recording_id, :bigint
    add_column :clinic_scribe_sources, :capture_epoch, :integer
    add_column :clinic_scribe_sources, :recording_segment_index, :integer
    add_column :clinic_scribe_sources, :source_order, :integer
    add_column :clinic_scribe_sources, :source_set_digest, :string, limit: 64
    tenant_fk :clinic_scribe_sources, :telehealth_visit_id, :clinic_telehealth_visits
    tenant_fk :clinic_scribe_sources, :telehealth_recording_id, :clinic_scribe_recordings
    add_index :clinic_scribe_sources,
      [ :practice_id, :telehealth_visit_id, :capture_epoch, :recording_segment_index, :source_order ],
      unique: true, where: "telehealth_visit_id IS NOT NULL", name: "idx_telehealth_scribe_source_order"
    add_check_constraint :clinic_scribe_sources, <<~SQL.squish, name: "scribe_sources_telehealth_values"
      ((telehealth_visit_id IS NULL AND telehealth_recording_id IS NULL AND capture_epoch IS NULL AND recording_segment_index IS NULL AND source_order IS NULL AND source_set_digest IS NULL) OR
       (telehealth_visit_id IS NOT NULL AND telehealth_recording_id IS NOT NULL AND capture_epoch > 0 AND recording_segment_index >= 0 AND source_order > 0 AND length(source_set_digest) = 64))
    SQL

    immutable_trigger :clinic_telehealth_checkins, "telehealth_checkins_immutable"
    immutable_trigger :clinic_telehealth_consents, "telehealth_consents_immutable"
    immutable_trigger :clinic_telehealth_provider_events, "telehealth_provider_events_immutable"
    immutable_trigger :clinic_telehealth_patient_receipts, "telehealth_patient_receipts_immutable"

    reversible do |direction|
      direction.up do
        execute <<~SQL
          INSERT INTO permissions (action_code, created_at, updated_at)
          SELECT action_code, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM unnest(ARRAY[
            'telehealth.read','telehealth.prepare.read','telehealth.prepare.verify','telehealth.host',
            'telehealth.participate','telehealth.configure','telehealth.reconcile'
          ]) AS action_code
          ON CONFLICT (action_code) DO NOTHING;
        SQL
        execute <<~SQL
          CREATE FUNCTION telehealth_policy_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
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
          CREATE TRIGGER telehealth_policy_versions_freeze BEFORE UPDATE OR DELETE ON clinic_telehealth_policy_versions
            FOR EACH ROW EXECUTE FUNCTION telehealth_policy_freeze();

          CREATE FUNCTION telehealth_join_grant_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF TG_OP = 'DELETE' OR
               (to_jsonb(OLD) - 'revoked_at' - 'revocation_reason') <> (to_jsonb(NEW) - 'revoked_at' - 'revocation_reason') OR
               (OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at) THEN
              RAISE EXCEPTION 'telehealth join grants are immutable except for first revocation';
            END IF;
            RETURN NEW;
          END; $$;
          CREATE TRIGGER telehealth_join_grants_freeze BEFORE UPDATE OR DELETE ON clinic_telehealth_join_grants
            FOR EACH ROW EXECUTE FUNCTION telehealth_join_grant_freeze();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER telehealth_join_grants_freeze ON clinic_telehealth_join_grants"
        execute "DROP FUNCTION telehealth_join_grant_freeze()"
        execute "DROP TRIGGER telehealth_policy_versions_freeze ON clinic_telehealth_policy_versions"
        execute "DROP FUNCTION telehealth_policy_freeze()"
      end
    end
  end

  private

  def tenant_identity(table)
    add_index table, [ :practice_id, :id ], unique: true
    add_foreign_key table, :clinic_practices, column: :practice_id
  end

  def tenant_fk(table, column, target)
    add_foreign_key table, target, column: [ :practice_id, column ], primary_key: [ :practice_id, :id ]
  end

  def immutable_trigger(table, name)
    reversible do |direction|
      direction.up do
        execute "CREATE TRIGGER #{name} BEFORE UPDATE OR DELETE ON #{table} FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
      end
      direction.down { execute "DROP TRIGGER #{name} ON #{table}" }
    end
  end
end
