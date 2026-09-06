class CreateWorkforceScheduling < ActiveRecord::Migration[8.1]
  def change
    create_table :clinic_workforce_schedule_templates do |t|
      t.bigint :practice_id, :site_id, :created_by_id, null: false
      t.string :name, :timezone, null: false
      t.jsonb :shift_definitions, null: false, default: []
      t.integer :revision, null: false, default: 1
      t.boolean :active, null: false, default: true
      t.timestamps
    end
    tenant_key(:clinic_workforce_schedule_templates)
    site_key(:clinic_workforce_schedule_templates)
    actor_key(:clinic_workforce_schedule_templates, :created_by_id)
    add_index :clinic_workforce_schedule_templates, [ :practice_id, :site_id, :name ], unique: true, where: "active", name: "workforce_schedule_templates_active_name"
    add_check_constraint :clinic_workforce_schedule_templates, "length(trim(name)) BETWEEN 1 AND 120 AND length(trim(timezone)) BETWEEN 1 AND 80 AND revision > 0", name: "workforce_schedule_templates_values"

    create_table :clinic_workforce_schedule_drafts do |t|
      t.bigint :practice_id, :site_id, :created_by_id, null: false
      t.bigint :schedule_template_id
      t.date :week_start_on, null: false
      t.string :timezone, :status, null: false
      t.integer :revision, null: false, default: 1
      t.timestamps
    end
    tenant_key(:clinic_workforce_schedule_drafts)
    site_key(:clinic_workforce_schedule_drafts)
    actor_key(:clinic_workforce_schedule_drafts, :created_by_id)
    add_foreign_key :clinic_workforce_schedule_drafts, :clinic_workforce_schedule_templates,
      column: [ :practice_id, :schedule_template_id ], primary_key: [ :practice_id, :id ]
    add_index :clinic_workforce_schedule_drafts, [ :practice_id, :site_id, :week_start_on, :status ], name: "workforce_schedule_drafts_week"
    add_check_constraint :clinic_workforce_schedule_drafts, "status IN ('draft','published','superseded') AND length(trim(timezone)) BETWEEN 1 AND 80 AND revision > 0", name: "workforce_schedule_drafts_values"

    create_table :clinic_workforce_shifts do |t|
      t.bigint :practice_id, :schedule_draft_id, :employment_id, null: false
      t.string :public_id, :timezone, :local_start, :local_end, :start_occurrence, :end_occurrence, null: false
      t.datetime :starts_at, :ends_at, null: false
      t.string :role_name
      t.integer :break_minutes, null: false, default: 0
      t.integer :lock_version, null: false, default: 0
      t.timestamps
    end
    tenant_key(:clinic_workforce_shifts)
    add_foreign_key :clinic_workforce_shifts, :clinic_workforce_schedule_drafts,
      column: [ :practice_id, :schedule_draft_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_workforce_shifts, :clinic_workforce_employments,
      column: [ :practice_id, :employment_id ], primary_key: [ :practice_id, :id ]
    add_index :clinic_workforce_shifts, [ :practice_id, :public_id ], unique: true
    add_index :clinic_workforce_shifts, [ :practice_id, :employment_id, :starts_at, :ends_at ], name: "workforce_shifts_employee_interval"
    add_check_constraint :clinic_workforce_shifts, "ends_at > starts_at AND break_minutes >= 0 AND break_minutes < (EXTRACT(EPOCH FROM (ends_at - starts_at)) / 60) AND start_occurrence IN ('only','first','second') AND end_occurrence IN ('only','first','second')", name: "workforce_shifts_values"

    create_table :clinic_workforce_schedule_publications do |t|
      t.bigint :practice_id, :site_id, :schedule_draft_id, :published_by_id, null: false
      t.bigint :supersedes_id
      t.date :week_start_on, null: false
      t.string :timezone, :snapshot_digest, :idempotency_key, :request_digest, null: false
      t.integer :version, null: false
      t.jsonb :shift_snapshot, null: false, default: []
      t.datetime :published_at, null: false
      t.timestamps
    end
    tenant_key(:clinic_workforce_schedule_publications)
    site_key(:clinic_workforce_schedule_publications)
    actor_key(:clinic_workforce_schedule_publications, :published_by_id)
    add_foreign_key :clinic_workforce_schedule_publications, :clinic_workforce_schedule_drafts,
      column: [ :practice_id, :schedule_draft_id ], primary_key: [ :practice_id, :id ]
    add_foreign_key :clinic_workforce_schedule_publications, :clinic_workforce_schedule_publications,
      column: [ :practice_id, :supersedes_id ], primary_key: [ :practice_id, :id ]
    add_index :clinic_workforce_schedule_publications, [ :practice_id, :site_id, :week_start_on, :version ], unique: true, name: "workforce_schedule_publications_version"
    add_index :clinic_workforce_schedule_publications, [ :practice_id, :idempotency_key ], unique: true, name: "workforce_schedule_publications_retry"
    add_check_constraint :clinic_workforce_schedule_publications, "version > 0 AND length(trim(timezone)) BETWEEN 1 AND 80 AND length(snapshot_digest) = 64 AND length(request_digest) = 64", name: "workforce_schedule_publications_values"

    create_table :clinic_workforce_availability_versions do |t|
      t.bigint :practice_id, :site_id, :employment_id, :created_by_id, null: false
      t.date :effective_from, :effective_until
      t.string :public_id, :timezone, :status, :reason, :idempotency_key, :request_digest, null: false
      t.string :decision_reason
      t.jsonb :weekly_rules, null: false, default: []
      t.jsonb :decision_receipts, null: false, default: {}
      t.bigint :reviewed_by_id
      t.datetime :submitted_at, :decided_at, :cancelled_at
      t.integer :revision, null: false, default: 1
      t.timestamps
    end
    tenant_key(:clinic_workforce_availability_versions)
    site_key(:clinic_workforce_availability_versions)
    employment_key(:clinic_workforce_availability_versions)
    actor_key(:clinic_workforce_availability_versions, :created_by_id)
    actor_key(:clinic_workforce_availability_versions, :reviewed_by_id)
    request_indexes(:clinic_workforce_availability_versions)
    add_index :clinic_workforce_availability_versions, [ :practice_id, :site_id, :employment_id ], unique: true, where: "status = 'approved'", name: "workforce_availability_current"
    add_check_constraint :clinic_workforce_availability_versions, "status IN ('submitted','approved','denied','cancelled','superseded') AND revision > 0 AND (effective_until IS NULL OR effective_until >= effective_from) AND length(trim(reason)) BETWEEN 1 AND 500 AND (decision_reason IS NULL OR length(trim(decision_reason)) BETWEEN 1 AND 500)", name: "workforce_availability_values"

    create_table :clinic_workforce_time_off_requests do |t|
      t.bigint :practice_id, :site_id, :employment_id, :requested_by_id, null: false
      t.bigint :reviewed_by_id
      t.string :public_id, :status, :timezone, :reason, :idempotency_key, :request_digest, null: false
      t.string :decision_reason
      t.datetime :starts_at, :ends_at, :submitted_at, :decided_at, :cancelled_at
      t.jsonb :decision_receipts, null: false, default: {}
      t.integer :revision, null: false, default: 1
      t.timestamps
    end
    tenant_key(:clinic_workforce_time_off_requests)
    site_key(:clinic_workforce_time_off_requests)
    employment_key(:clinic_workforce_time_off_requests)
    actor_key(:clinic_workforce_time_off_requests, :requested_by_id)
    actor_key(:clinic_workforce_time_off_requests, :reviewed_by_id)
    request_indexes(:clinic_workforce_time_off_requests)
    add_check_constraint :clinic_workforce_time_off_requests, "status IN ('submitted','approved','denied','cancelled') AND ends_at > starts_at AND revision > 0 AND length(trim(reason)) BETWEEN 1 AND 500 AND (decision_reason IS NULL OR length(trim(decision_reason)) BETWEEN 1 AND 500)", name: "workforce_time_off_requests_values"

    create_table :clinic_workforce_shift_swap_requests do |t|
      t.bigint :practice_id, :site_id, :requester_employment_id, :target_employment_id, :requested_by_id, null: false
      t.bigint :target_decided_by_id, :reviewed_by_id
      t.bigint :schedule_publication_id, null: false
      t.string :public_id, :offered_shift_public_id, :status, :reason, :idempotency_key, :request_digest, null: false
      t.string :target_reason, :decision_reason
      t.datetime :submitted_at, :target_decided_at, :decided_at, :cancelled_at, :expires_at
      t.jsonb :decision_receipts, null: false, default: {}
      t.integer :revision, null: false, default: 1
      t.timestamps
    end
    tenant_key(:clinic_workforce_shift_swap_requests)
    site_key(:clinic_workforce_shift_swap_requests)
    add_foreign_key :clinic_workforce_shift_swap_requests, :clinic_workforce_employments,
      column: [ :practice_id, :requester_employment_id ], primary_key: [ :practice_id, :id ], name: "fk_workforce_swap_requester"
    add_foreign_key :clinic_workforce_shift_swap_requests, :clinic_workforce_employments,
      column: [ :practice_id, :target_employment_id ], primary_key: [ :practice_id, :id ], name: "fk_workforce_swap_target"
    actor_key(:clinic_workforce_shift_swap_requests, :requested_by_id)
    actor_key(:clinic_workforce_shift_swap_requests, :target_decided_by_id)
    actor_key(:clinic_workforce_shift_swap_requests, :reviewed_by_id)
    add_foreign_key :clinic_workforce_shift_swap_requests, :clinic_workforce_schedule_publications,
      column: [ :practice_id, :schedule_publication_id ], primary_key: [ :practice_id, :id ]
    request_indexes(:clinic_workforce_shift_swap_requests)
    add_check_constraint :clinic_workforce_shift_swap_requests, "status IN ('submitted','accepted','declined','approved','denied','cancelled') AND requester_employment_id <> target_employment_id AND revision > 0 AND length(trim(reason)) BETWEEN 1 AND 500 AND (target_reason IS NULL OR length(trim(target_reason)) BETWEEN 1 AND 500) AND (decision_reason IS NULL OR length(trim(decision_reason)) BETWEEN 1 AND 500)", name: "workforce_shift_swap_requests_values"
  end

  private

  def tenant_key(table)
    add_index table, [ :practice_id, :id ], unique: true
    add_foreign_key table, :clinic_practices, column: :practice_id
  end

  def site_key(table)
    add_foreign_key table, :clinic_sites, column: [ :practice_id, :site_id ], primary_key: [ :practice_id, :id ]
  end

  def employment_key(table)
    add_foreign_key table, :clinic_workforce_employments, column: [ :practice_id, :employment_id ], primary_key: [ :practice_id, :id ]
  end

  def actor_key(table, column)
    add_foreign_key table, :clinic_memberships, column: [ :practice_id, column ], primary_key: [ :practice_id, :user_id ]
  end

  def request_indexes(table)
    add_index table, [ :practice_id, :public_id ], unique: true
    add_index table, [ :practice_id, :idempotency_key ], unique: true
    add_check_constraint table, "length(request_digest) = 64", name: "#{table}_digest"
  end
end
