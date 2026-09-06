class CreateWorkforceClock < ActiveRecord::Migration[8.0]
  def change
    create_table :clinic_workforce_badge_credentials do |t|
      t.bigint :practice_id, null: false
      t.bigint :employment_id, null: false
      t.string :secret_digest, null: false, limit: 64
      t.string :pin_digest
      t.string :format, null: false, default: "code128"
      t.string :status, null: false, default: "issued"
      t.bigint :issued_by_membership_id, null: false
      t.datetime :issued_at, null: false
      t.bigint :revoked_by_membership_id
      t.datetime :revoked_at
      t.bigint :replaced_by_id
      t.timestamps
    end
    tenant_identity :clinic_workforce_badge_credentials
    tenant_fk :clinic_workforce_badge_credentials, :employment_id, :clinic_workforce_employments
    tenant_fk :clinic_workforce_badge_credentials, :issued_by_membership_id, :clinic_memberships
    tenant_fk :clinic_workforce_badge_credentials, :revoked_by_membership_id, :clinic_memberships
    tenant_fk :clinic_workforce_badge_credentials, :replaced_by_id, :clinic_workforce_badge_credentials
    add_index :clinic_workforce_badge_credentials, :secret_digest, unique: true
    add_index :clinic_workforce_badge_credentials, [ :practice_id, :employment_id ], unique: true,
      where: "status = 'issued'", name: "idx_workforce_one_active_badge"
    add_check_constraint :clinic_workforce_badge_credentials,
      "length(secret_digest) = 64 AND format = 'code128' AND status IN ('issued','revoked','replaced')",
      name: "workforce_badges_valid"

    create_table :clinic_workforce_kiosk_enrollments do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.string :token_digest, null: false, limit: 64
      t.string :status, null: false, default: "issued"
      t.bigint :issued_by_membership_id, null: false
      t.datetime :expires_at, null: false
      t.datetime :enrolled_at
      t.bigint :revoked_by_membership_id
      t.datetime :revoked_at
      t.timestamps
    end
    tenant_identity :clinic_workforce_kiosk_enrollments
    tenant_fk :clinic_workforce_kiosk_enrollments, :site_id, :clinic_sites
    tenant_fk :clinic_workforce_kiosk_enrollments, :issued_by_membership_id, :clinic_memberships
    tenant_fk :clinic_workforce_kiosk_enrollments, :revoked_by_membership_id, :clinic_memberships
    add_index :clinic_workforce_kiosk_enrollments, :token_digest, unique: true
    add_check_constraint :clinic_workforce_kiosk_enrollments,
      "length(token_digest) = 64 AND status IN ('issued','enrolled','revoked','expired')",
      name: "workforce_kiosk_enrollments_valid"

    create_table :clinic_workforce_kiosk_sessions do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.bigint :kiosk_enrollment_id, null: false
      t.string :session_digest, null: false, limit: 64
      t.string :status, null: false, default: "active"
      t.datetime :expires_at, null: false
      t.datetime :last_seen_at, null: false
      t.datetime :revoked_at
      t.timestamps
    end
    tenant_identity :clinic_workforce_kiosk_sessions
    tenant_fk :clinic_workforce_kiosk_sessions, :site_id, :clinic_sites
    tenant_fk :clinic_workforce_kiosk_sessions, :kiosk_enrollment_id, :clinic_workforce_kiosk_enrollments
    add_index :clinic_workforce_kiosk_sessions, :session_digest, unique: true
    add_index :clinic_workforce_kiosk_sessions, [ :practice_id, :site_id, :status ]
    add_check_constraint :clinic_workforce_kiosk_sessions,
      "length(session_digest) = 64 AND status IN ('active','revoked','expired')",
      name: "workforce_kiosk_sessions_valid"

    create_table :clinic_workforce_punch_challenges do |t|
      t.bigint :practice_id, null: false
      t.bigint :kiosk_session_id, null: false
      t.bigint :employment_id, null: false
      t.string :challenge_digest, null: false, limit: 64
      t.jsonb :permitted_transitions, null: false, default: []
      t.datetime :expires_at, null: false
      t.datetime :consumed_at
      t.integer :failed_attempts, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_workforce_punch_challenges
    tenant_fk :clinic_workforce_punch_challenges, :kiosk_session_id, :clinic_workforce_kiosk_sessions
    tenant_fk :clinic_workforce_punch_challenges, :employment_id, :clinic_workforce_employments
    add_index :clinic_workforce_punch_challenges, :challenge_digest, unique: true
    add_index :clinic_workforce_punch_challenges, [ :practice_id, :kiosk_session_id, :expires_at ]
    add_check_constraint :clinic_workforce_punch_challenges,
      "length(challenge_digest) = 64 AND jsonb_typeof(permitted_transitions) = 'array' AND failed_attempts BETWEEN 0 AND 20",
      name: "workforce_punch_challenges_valid"

    create_table :clinic_workforce_punches do |t|
      t.bigint :practice_id, null: false
      t.bigint :site_id, null: false
      t.bigint :employment_id, null: false
      t.bigint :kiosk_session_id
      t.bigint :punch_challenge_id
      t.string :event_type, null: false
      t.datetime :occurred_at_utc, null: false
      t.string :time_zone, null: false
      t.integer :utc_offset_seconds, null: false
      t.date :local_date, null: false
      t.string :source, null: false, default: "kiosk"
      t.string :request_key, null: false, limit: 36
      t.string :payload_digest, null: false, limit: 64
      t.string :correlation_id, null: false, limit: 36
      t.datetime :received_at, null: false
      t.jsonb :result_snapshot, null: false, default: {}
      t.datetime :created_at, null: false
      t.datetime :updated_at, null: false
    end
    tenant_identity :clinic_workforce_punches
    tenant_fk :clinic_workforce_punches, :site_id, :clinic_sites
    tenant_fk :clinic_workforce_punches, :employment_id, :clinic_workforce_employments
    tenant_fk :clinic_workforce_punches, :kiosk_session_id, :clinic_workforce_kiosk_sessions
    tenant_fk :clinic_workforce_punches, :punch_challenge_id, :clinic_workforce_punch_challenges
    add_index :clinic_workforce_punches, [ :practice_id, :request_key ], unique: true
    add_index :clinic_workforce_punches, [ :practice_id, :employment_id, :occurred_at_utc, :id ],
      name: "idx_workforce_punches_employee_time"
    add_check_constraint :clinic_workforce_punches,
      "event_type IN ('clock_in','break_start','break_end','clock_out') AND source IN ('kiosk','manager_correction') AND length(request_key) = 36 AND length(payload_digest) = 64 AND length(correlation_id) = 36 AND jsonb_typeof(result_snapshot) = 'object'",
      name: "workforce_punches_valid"
    reversible do |direction|
      direction.up do
        execute "CREATE TRIGGER workforce_punches_immutable BEFORE UPDATE OR DELETE ON clinic_workforce_punches FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
      end
      direction.down { execute "DROP TRIGGER workforce_punches_immutable ON clinic_workforce_punches" }
    end

    create_table :clinic_workforce_timecard_versions do |t|
      t.bigint :practice_id, null: false
      t.bigint :employment_id, null: false
      t.date :period_start, null: false
      t.date :period_end, null: false
      t.integer :version_number, null: false
      t.string :status, null: false, default: "draft"
      t.string :source_digest, null: false, limit: 64
      t.bigint :previous_version_id
      t.jsonb :settings_provenance, null: false, default: {}
      t.jsonb :snapshot, null: false, default: {}
      t.jsonb :unresolved_exceptions, null: false, default: []
      t.integer :raw_total_minutes, null: false, default: 0
      t.integer :rounded_total_minutes, null: false, default: 0
      t.integer :regular_minutes
      t.integer :overtime_minutes
      t.datetime :submitted_at
      t.bigint :submitted_by_membership_id
      t.datetime :approved_at
      t.bigint :approved_by_membership_id
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_workforce_timecard_versions
    tenant_fk :clinic_workforce_timecard_versions, :employment_id, :clinic_workforce_employments
    tenant_fk :clinic_workforce_timecard_versions, :previous_version_id, :clinic_workforce_timecard_versions
    tenant_fk :clinic_workforce_timecard_versions, :submitted_by_membership_id, :clinic_memberships
    tenant_fk :clinic_workforce_timecard_versions, :approved_by_membership_id, :clinic_memberships
    add_index :clinic_workforce_timecard_versions,
      [ :practice_id, :employment_id, :period_start, :version_number ], unique: true,
      name: "idx_workforce_timecard_version"
    add_index :clinic_workforce_timecard_versions, [ :practice_id, :employment_id, :period_start, :status ],
      name: "idx_workforce_timecards_status"
    add_check_constraint :clinic_workforce_timecard_versions,
      "period_end > period_start AND version_number > 0 AND status IN ('draft','submitted','approved','superseded') AND length(source_digest) = 64 AND jsonb_typeof(settings_provenance) = 'object' AND jsonb_typeof(snapshot) = 'object' AND jsonb_typeof(unresolved_exceptions) = 'array' AND raw_total_minutes >= 0 AND rounded_total_minutes >= 0 AND (regular_minutes IS NULL OR regular_minutes >= 0) AND (overtime_minutes IS NULL OR overtime_minutes >= 0)",
      name: "workforce_timecards_valid"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION workforce_timecard_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF OLD.status IN ('approved','superseded') THEN
              RAISE EXCEPTION 'approved workforce timecards are immutable';
            END IF;
            RETURN NEW;
          END
          $$;
          CREATE TRIGGER workforce_timecard_freeze BEFORE UPDATE OR DELETE ON clinic_workforce_timecard_versions FOR EACH ROW EXECUTE FUNCTION workforce_timecard_freeze();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER workforce_timecard_freeze ON clinic_workforce_timecard_versions"
        execute "DROP FUNCTION workforce_timecard_freeze()"
      end
    end

    create_table :clinic_workforce_time_segments do |t|
      t.bigint :practice_id, null: false
      t.bigint :timecard_version_id, null: false
      t.bigint :site_id, null: false
      t.string :segment_kind, null: false
      t.date :local_date, null: false
      t.datetime :started_at_utc, null: false
      t.datetime :ended_at_utc, null: false
      t.integer :raw_minutes, null: false
      t.integer :rounded_minutes, null: false
      t.integer :paid_minutes, null: false
      t.integer :regular_minutes
      t.integer :overtime_minutes
      t.jsonb :source_punch_ids, null: false, default: []
      t.jsonb :settings_provenance, null: false, default: {}
      t.jsonb :exception_codes, null: false, default: []
      t.timestamps
    end
    tenant_identity :clinic_workforce_time_segments
    tenant_fk :clinic_workforce_time_segments, :timecard_version_id, :clinic_workforce_timecard_versions
    tenant_fk :clinic_workforce_time_segments, :site_id, :clinic_sites
    add_index :clinic_workforce_time_segments, [ :practice_id, :timecard_version_id, :started_at_utc ],
      name: "idx_workforce_segments_timecard"
    add_check_constraint :clinic_workforce_time_segments,
      "segment_kind IN ('work','break','manual') AND ended_at_utc > started_at_utc AND raw_minutes >= 0 AND rounded_minutes >= 0 AND paid_minutes >= 0 AND (regular_minutes IS NULL OR regular_minutes >= 0) AND (overtime_minutes IS NULL OR overtime_minutes >= 0) AND jsonb_typeof(source_punch_ids) = 'array' AND jsonb_typeof(settings_provenance) = 'object' AND jsonb_typeof(exception_codes) = 'array'",
      name: "workforce_time_segments_valid"
    reversible do |direction|
      direction.up do
        execute "CREATE TRIGGER workforce_segments_immutable BEFORE UPDATE OR DELETE ON clinic_workforce_time_segments FOR EACH ROW EXECUTE FUNCTION erd_immutable_record()"
      end
      direction.down { execute "DROP TRIGGER workforce_segments_immutable ON clinic_workforce_time_segments" }
    end

    create_table :clinic_workforce_adjustment_requests do |t|
      t.bigint :practice_id, null: false
      t.bigint :employment_id, null: false
      t.bigint :timecard_version_id, null: false
      t.string :status, null: false, default: "submitted"
      t.string :correction_type, null: false
      t.jsonb :proposed_changes, null: false, default: {}
      t.string :reason, null: false, limit: 1000
      t.bigint :requested_by_membership_id, null: false
      t.datetime :requested_at, null: false
      t.bigint :reviewed_by_membership_id
      t.datetime :reviewed_at
      t.string :decision_reason, limit: 1000
      t.string :request_key, null: false, limit: 36
      t.string :payload_digest, null: false, limit: 64
      t.integer :source_lock_version, null: false
      t.bigint :resulting_timecard_version_id
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_identity :clinic_workforce_adjustment_requests
    tenant_fk :clinic_workforce_adjustment_requests, :employment_id, :clinic_workforce_employments
    tenant_fk :clinic_workforce_adjustment_requests, :timecard_version_id, :clinic_workforce_timecard_versions
    tenant_fk :clinic_workforce_adjustment_requests, :requested_by_membership_id, :clinic_memberships
    tenant_fk :clinic_workforce_adjustment_requests, :reviewed_by_membership_id, :clinic_memberships
    tenant_fk :clinic_workforce_adjustment_requests, :resulting_timecard_version_id, :clinic_workforce_timecard_versions
    add_index :clinic_workforce_adjustment_requests, [ :practice_id, :request_key ], unique: true
    add_index :clinic_workforce_adjustment_requests, [ :practice_id, :employment_id, :status ]
    add_check_constraint :clinic_workforce_adjustment_requests,
      "status IN ('submitted','approved','denied') AND correction_type IN ('add_segment','replace_segment','remove_segment') AND length(trim(reason)) > 0 AND length(request_key) = 36 AND length(payload_digest) = 64 AND jsonb_typeof(proposed_changes) = 'object'",
      name: "workforce_adjustments_valid"
    reversible do |direction|
      direction.up do
        execute <<~SQL
          CREATE FUNCTION workforce_adjustment_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF OLD.status IN ('approved','denied') THEN
              RAISE EXCEPTION 'decided workforce adjustments are immutable';
            END IF;
            RETURN NEW;
          END
          $$;
          CREATE TRIGGER workforce_adjustment_freeze BEFORE UPDATE OR DELETE ON clinic_workforce_adjustment_requests FOR EACH ROW EXECUTE FUNCTION workforce_adjustment_freeze();
        SQL
      end
      direction.down do
        execute "DROP TRIGGER workforce_adjustment_freeze ON clinic_workforce_adjustment_requests"
        execute "DROP FUNCTION workforce_adjustment_freeze()"
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
end
