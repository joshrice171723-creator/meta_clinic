require "test_helper"

class ClinicAuditFailureTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    organization = Organization.create!(name: "Synthetic Audit Failure Organization")
    @user = User.create!(email_address: "audit-failure@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic Audit Failure Practice", organization: organization)
    @membership = @practice.memberships.create!(user: @user)
    grant_permissions!(@membership, "patients.read", "clinical_records.read", "encounters.write")
    @patient = @practice.patients.create!(display_name: "SYN_AuditFailure, Avery", reference: "SYN-AUDIT-FAILURE-001")
    @encounter = @practice.encounters.create!(patient: @patient, started_at: Time.utc(2026, 9, 2, 14), status: "open")
    @follow_up = Clinic::EncounterFollowUp.create!(
      practice: @practice,
      patient: @patient,
      encounter: @encounter,
      source_kind: "in_person",
      state: "not_required",
      plan: "No scheduled follow-up is required.",
      outcome: "",
      recorded_by_membership: @membership,
      updated_by_membership: @membership
    )
    login
  end

  test "a denied mutation rolls back its work and retains exactly one denial audit" do
    post "/api/clinic/patients/#{@patient.id}/clinical_history/allergies",
      params: denied_allergy_params,
      headers: csrf_headers,
      as: :json

    assert_response :forbidden
    assert_empty @patient.allergies.reload
    assert_equal 1, @practice.audit_events.where(action_code: "notes.write", outcome: "denied").count

    revoke_all_permissions!(@membership)
    get "/api/clinic/patients", headers: @headers

    assert_response :forbidden
    assert_equal 1, @practice.audit_events.where(action_code: "patients.read", outcome: "denied").count
  end

  test "a denied mutation fails closed when its replacement audit cannot be persisted" do
    headers = csrf_headers
    original_record = Clinic::AuditRecorder.method(:record!)
    denial_records = 0
    Clinic::AuditRecorder.define_singleton_method(:record!) do |**arguments|
      if arguments[:action_code] == "notes.write" && arguments[:outcome] == :denied
        denial_records += 1
        raise Clinic::AuditRecorder::Unavailable if denial_records == 2
      end
      original_record.call(**arguments)
    end

    post "/api/clinic/patients/#{@patient.id}/clinical_history/allergies",
      params: denied_allergy_params,
      headers: headers,
      as: :json

    assert_response :service_unavailable
    assert_equal "audit_unavailable", response.parsed_body.fetch("code")
    assert_equal 2, denial_records
    assert_empty @patient.allergies.reload
    assert_not @practice.audit_events.where(action_code: "notes.write", outcome: "denied").exists?
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  test "a protected read fails closed when required audit evidence cannot be recorded" do
    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }

    get "/api/clinic/tracking_board", headers: @headers

    assert_response :service_unavailable
    assert_equal "audit_unavailable", response.parsed_body.fetch("code")
    assert_not_includes response.body, @practice.id.to_s
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  test "a protected close replays the same receipt and rejects changed retry data" do
    payload = close_payload(request_key: "close-retry-001", ended_at: "2026-09-02T15:00:00Z")
    post "/api/clinic/encounters/#{@encounter.id}/close", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    first_response = response.parsed_body
    committed_encounter = @encounter.reload
    manifest = @practice.audit_events.where(action_code: "encounters.close", outcome: "committed").sole.resource_manifests.sole
    assert_equal "encounter:#{committed_encounter.id}:completion_review:#{first_response.fetch('completion_review').fetch('id')}",
      manifest.protected_resource_version_ref

    post "/api/clinic/encounters/#{@encounter.id}/close", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal first_response, response.parsed_body
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "close-retry-001").count

    changed = payload.deep_dup
    changed[:close][:ended_at] = "2026-09-02T16:00:00Z"
    post "/api/clinic/encounters/#{@encounter.id}/close", params: changed, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")

    get "/api/clinic/operation_receipts/close-retry-001", headers: @headers
    assert_response :success
    receipt = response.parsed_body.fetch("receipt")
    assert_equal "committed", receipt.fetch("outcome")
    assert_equal "hmac-sha256-v1", receipt.fetch("digest_algorithm")
    assert_equal false, receipt.fetch("reconciliation_required")
    assert_equal false, receipt.fetch("automatic_retry")
    assert_not_includes response.body, "payload_digest"

    get "/api/clinic/operation_receipts/not-found", headers: @headers
    assert_response :not_found
  end

  test "a keyed close without an explicit time replays the server-timed result" do
    @encounter.update!(started_at: Time.current - 1.hour)
    payload = close_payload(request_key: "close-server-time")
    post "/api/clinic/encounters/#{@encounter.id}/close", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    first = response.parsed_body

    post "/api/clinic/encounters/#{@encounter.id}/close", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal first, response.parsed_body
    assert_equal 1, Clinic::OperationReceipt.where(practice: @practice, request_key: "close-server-time").count

    changed = payload.deep_dup
    changed[:close][:ended_at] = "2026-09-02T16:00:00Z"
    post "/api/clinic/encounters/#{@encounter.id}/close", params: changed, headers: csrf_headers, as: :json
    assert_response :conflict
    assert_equal "idempotency_conflict", response.parsed_body.fetch("code")
  end

  test "a protected close rolls back when its commit audit cannot be persisted" do
    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }

    post "/api/clinic/encounters/#{@encounter.id}/close",
      params: close_payload(request_key: "close-fail-001", ended_at: "2026-09-02T15:00:00Z"),
      headers: csrf_headers, as: :json

    assert_response :service_unavailable
    assert_equal "open", @encounter.reload.status
    assert_nil @encounter.ended_at
    assert_not Clinic::OperationReceipt.exists?(practice: @practice, request_key: "close-fail-001")
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  test "an unconfirmed close receipt never renders completion" do
    receipt = Clinic::OperationReceipt.create!(
      practice: @practice, actor_membership: @membership, operation_code: "encounters.close",
      request_key: "close-unconfirmed", payload_digest: "0" * 64,
      digest_algorithm: Clinic::Idempotency::LEGACY_DIGEST_ALGORITHM, outcome: :outcome_unconfirmed,
      resource_type: "Clinic::Encounter", resource_id: @encounter.id
    )
    original_execute = Clinic::Idempotency.method(:execute)
    Clinic::Idempotency.define_singleton_method(:execute) do |**arguments|
      raise "unexpected request key" unless arguments[:request_key] == "close-unconfirmed"

      Clinic::Idempotency::Outcome.new(receipt: receipt, value: nil, replayed: false)
    end

    post "/api/clinic/encounters/#{@encounter.id}/close",
      params: close_payload(request_key: "close-unconfirmed"),
      headers: csrf_headers, as: :json

    assert_response :conflict
    assert_equal "outcome_unconfirmed", response.parsed_body.fetch("code")
    assert_equal "open", @encounter.reload.status
    assert_nil @encounter.ended_at
  ensure
    Clinic::Idempotency.define_singleton_method(:execute, original_execute) if original_execute
  end

  test "Muse 71 practice audit projects bounded immutable evidence and isolates switched practice snapshots" do
    grant_permissions!(@membership, "roles.manage")
    first = Clinic::AuditRecorder.record!(practice: @practice, actor: @user, action_code: "synthetic.audit.projection", outcome: :committed, resource_version_ref: "synthetic-note:1:revision:1")
    second = Clinic::AuditRecorder.record!(practice: @practice, actor: @user, action_code: "synthetic.audit.projection", outcome: :committed, resource_version_ref: "synthetic-note:1:revision:2")
    other = Clinic::Practice.create!(name: "Synthetic Other Audit Practice", organization: @practice.organization)
    other_membership = other.memberships.create!(user: @user)
    grant_permissions!(other_membership, "roles.manage")
    foreign = Clinic::AuditRecorder.record!(practice: other, actor: @user, action_code: "synthetic.audit.projection", outcome: :committed, resource_version_ref: "synthetic-other-note:1")
    get "/api/clinic/audit_events", params: { action_code: first.action_code, outcome: "committed", per_page: 1 }, headers: @headers
    assert_response :success
    payload = response.parsed_body
    row = payload.fetch("events").sole
    assert_equal second.id, row.fetch("id")
    assert_equal %w[action_code actor_display_name actor_reference id occurred_at outcome policy_version resource_references], row.keys.sort
    assert_equal "user:#{@user.id}", row.fetch("actor_reference")
    assert_equal [ "synthetic-note:1:revision:2" ], row.fetch("resource_references")
    assert_equal 2, payload.fetch("pagination").fetch("total")
    snapshot = payload.fetch("snapshot_id")
    Clinic::AuditRecorder.record!(practice: @practice, actor: @user, action_code: first.action_code, outcome: :committed)
    get "/api/clinic/audit_events", params: { action_code: first.action_code, outcome: "committed", per_page: 1, page: 2, snapshot_id: snapshot }, headers: @headers
    assert_response :success
    assert_equal [ first.id ], response.parsed_body.fetch("events").map { |event| event.fetch("id") }
    assert_equal 2, response.parsed_body.fetch("pagination").fetch("total")
    patch "/api/clinic/context", params: { practice_id: other.id }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/clinic/audit_events", params: { action_code: first.action_code }, headers: @headers
    assert_response :success
    assert_equal [ foreign.id ], response.parsed_body.fetch("events").map { |event| event.fetch("id") }
    assert_equal 1, other.audit_events.where(action_code: "audit.events.read", outcome: "released").count
    revoke_all_permissions!(other_membership)
    get "/api/clinic/audit_events", headers: @headers
    assert_response :forbidden
    assert_not_includes response.body, "synthetic-other-note"
  end

  test "Muse 71 practice audit fails closed when read evidence cannot be recorded" do
    grant_permissions!(@membership, "roles.manage")
    Clinic::AuditRecorder.record!(practice: @practice, actor: @user, action_code: "synthetic.audit.protected", outcome: :committed, resource_version_ref: "synthetic-hidden-reference")
    original_record = Clinic::AuditRecorder.method(:record!)
    Clinic::AuditRecorder.define_singleton_method(:record!) { |**| raise Clinic::AuditRecorder::Unavailable }
    get "/api/clinic/audit_events", headers: @headers
    assert_response :service_unavailable
    assert_equal "audit_unavailable", response.parsed_body.fetch("code")
    assert_not_includes response.body, "synthetic-hidden-reference"
  ensure
    Clinic::AuditRecorder.define_singleton_method(:record!, original_record) if original_record
  end

  private

  def denied_allergy_params
    {
      clinical_history: {
        encounter_id: @encounter.id,
        request_key: "audit-failure-denied-allergy",
        allergen_name: "Synthetic allergen",
        reaction: "Synthetic reaction",
        category: "medication",
        clinical_status: "active",
        verification_status: "confirmed",
        criticality: "high",
        severity: "moderate"
      }
    }
  end

  def close_payload(request_key:, ended_at: nil)
    close = {
      patient_id: @patient.id,
      request_key: request_key,
      disposition_code: "completed_as_planned",
      instructions_status: "not_required",
      education_status: "not_required",
      follow_up_id: @follow_up.id,
      follow_up_version: @follow_up.lock_version,
      expected_follow_up_state: @follow_up.state,
      instruction_note_revision_id: nil,
      expected_education_event_ids: [],
      expected_open_task_versions: [],
      open_work_reviewed: true,
      exception_note: nil
    }
    close[:ended_at] = ended_at if ended_at
    { close: close }
  end

  def login
    get "/api/csrf", headers: @headers
    csrf_token = response.parsed_body.fetch("csrf_token")
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: @headers.merge("X-CSRF-Token" => csrf_token), as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
