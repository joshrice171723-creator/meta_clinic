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
    grant_permissions!(@membership, "patients.read", "encounters.write")
    patient = @practice.patients.create!(display_name: "SYN_AuditFailure, Avery", reference: "SYN-AUDIT-FAILURE-001")
    @encounter = @practice.encounters.create!(patient: patient, started_at: Time.utc(2026, 9, 2, 14), status: "open")
    login
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
    payload = { close: { patient_id: @encounter.patient_id, ended_at: "2026-09-02T15:00:00Z", request_key: "close-retry-001" } }
    post "/api/clinic/encounters/#{@encounter.id}/close", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    first_response = response.parsed_body
    committed_encounter = @encounter.reload
    manifest = @practice.audit_events.where(action_code: "encounters.close", outcome: "committed").sole.resource_manifests.sole
    assert_equal "encounter:#{committed_encounter.id}:#{committed_encounter.updated_at.utc.iso8601(6)}",
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
    payload = { close: { patient_id: @encounter.patient_id, request_key: "close-server-time" } }
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
      params: { close: { patient_id: @encounter.patient_id, ended_at: "2026-09-02T15:00:00Z", request_key: "close-fail-001" } },
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
      params: { close: { patient_id: @encounter.patient_id, request_key: "close-unconfirmed" } },
      headers: csrf_headers, as: :json

    assert_response :conflict
    assert_equal "outcome_unconfirmed", response.parsed_body.fetch("code")
    assert_equal "open", @encounter.reload.status
    assert_nil @encounter.ended_at
  ensure
    Clinic::Idempotency.define_singleton_method(:execute, original_execute) if original_execute
  end

  private

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
