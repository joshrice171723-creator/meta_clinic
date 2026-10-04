require "test_helper"

class QaOfficeWorkTest < ActionDispatch::IntegrationTest
  setup do
    @keys = %w[QA_OFFICE_ACTORS_ENABLED QA_OFFICE_MUSE_TOKEN_ID QA_OFFICE_DOT_TOKEN_ID QA_OFFICE_CODEX_TOKEN_ID QA_OFFICE_JOSH_USER_ID]
    @saved = @keys.to_h { |key| [ key, ENV[key] ] }
    @owner = User.create!(email_address: "office-work-owner@example.invalid", password: "Independent-office-only!", platform_owner: true)
    @muse_raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    @dot_raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    @muse = Qa::ServiceToken.create!(user: @owner, recipient: "muse", scope: "office", name: "Independent Muse", digest: Digest::SHA256.hexdigest(@muse_raw))
    @dot = Qa::ServiceToken.create!(user: @owner, recipient: "codex", scope: "office", name: "Independent dot", digest: Digest::SHA256.hexdigest(@dot_raw))
    ENV["QA_OFFICE_ACTORS_ENABLED"] = "1"
    ENV["QA_OFFICE_MUSE_TOKEN_ID"] = @muse.id.to_s
    ENV["QA_OFFICE_DOT_TOKEN_ID"] = @dot.id.to_s
    ENV["QA_OFFICE_JOSH_USER_ID"] = @owner.id.to_s
    @revision = "a" * 40
    @build = { "revision" => @revision, "version" => "office-test", "dirty" => false }
    @input = { kind: "coordination", request_key: "office-work-request", title: "Return a useful result", recipient: "muse", revision: @revision, payload: { description: "Report one observed capability." } }
  end

  teardown do
    @saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  def with_build
    original = Qa::Workspace.method(:build)
    build = @build
    Qa::Workspace.define_singleton_method(:build) { build }
    yield
  ensure
    Qa::Workspace.define_singleton_method(:build, original)
  end

  def send_request(raw = @dot_raw, input = @input)
    with_build do
      post "/api/qa/tasks", params: { task: input }, headers: { "Authorization" => "Bearer #{raw}" }, as: :json
    end
  end

  def advance(id, status, raw = @muse_raw, key: "transition-#{status}", result: nil, assignee: nil)
    input = { request_key: key, status: }
    input[:result] = result if result
    input[:assigned_actor] = assignee if assignee
    post "/api/qa/office/work/#{id}/transition", params: input, headers: { "Authorization" => "Bearer #{raw}" }, as: :json
  end

  test "real principal flow and identical retries preserve one task and one result" do
    send_request
    assert_response :created
    id = response.parsed_body.fetch("id")
    send_request
    assert_response :created
    assert_equal id, response.parsed_body.fetch("id")
    assert_equal 1, Qa::Task.where(request_key: @input[:request_key]).count
    send_request(@dot_raw, @input.merge(title: "Different work"))
    assert_response :conflict
    advance(id, "acknowledged", @dot_raw)
    assert_response :forbidden
    advance(id, "acknowledged")
    assert_response :success
    receipt = response.parsed_body
    advance(id, "acknowledged")
    assert_response :success
    assert_equal receipt, response.parsed_body
    assert_equal "acknowledged", Qa::Task.find(id).payload["office_status"]
    advance(id, "working", result: { summary: "Checking capability" })
    assert_response :success
    advance(id, "blocked", result: { summary: "Waiting on protected access" })
    assert_response :success
    advance(id, "completed", result: { summary: "Capability inspected", evidence_refs: [] })
    assert_response :success
    result = response.parsed_body
    advance(id, "completed", result: { summary: "Capability inspected", evidence_refs: [] })
    assert_equal result, response.parsed_body
    advance(id, "completed", result: { summary: "Changed result" })
    assert_response :conflict
    advance(id, "result_confirmed")
    assert_response :forbidden
    advance(id, "result_confirmed", @dot_raw)
    assert_response :success
    assert_equal "result_confirmed", response.parsed_body["office_status"]
    get "/api/qa/office/work"
    assert_response :success
    assert_equal "result_confirmed", response.parsed_body["tasks"].first["office_status"]
    assert_empty response.parsed_body["tasks"].first["allowed_transitions"]
    assert_not_includes response.body, "requester_principal"
    assert_not_includes response.body, @muse_raw
  end

  test "expired work cannot finish and explicit owner recovery preserves history" do
    send_request
    id = response.parsed_body.fetch("id")
    advance(id, "acknowledged")
    task = Qa::Task.find(id)
    task.update!(lease_expires_at: 1.second.ago)
    advance(id, "completed", result: { summary: "Too late" })
    assert_response :forbidden
    assert_equal [ "recover" ], Qa::OfficeWork.allowed(task, Qa::OfficeWork.identity(@owner, nil))
    result = Qa::OfficeWork.transition(user: @owner, token: nil, id:, input: { "request_key" => "recover-expired-work", "status" => "recover" })
    assert_equal "queued", result["status"]
    assert_nil task.reload.claim_principal
    assert Qa::Event.where(kind: "office_work_transition").where("payload ->> 'task_id' = ?", id.to_s).count >= 2
  end

  test "Office credentials cannot access QA operations or impersonate message author" do
    %w[pin baseline state events coverage].each do |route|
      post "/api/qa/#{route}", params: {}, headers: { "Authorization" => "Bearer #{@muse_raw}" }, as: :json
      assert_response :forbidden
    end
    send_request(@muse_raw, @input.merge(kind: "qa_run"))
    assert_response :forbidden
    with_build do
      post "/api/qa/room/messages", params: { message: { message_key: "office-message-verified", agent: "dot", recipient: "Office", body: "Observed useful result" } }, headers: { "Authorization" => "Bearer #{@muse_raw}" }, as: :json
    end
    assert_response :created
    assert_equal "Muse", response.parsed_body.dig("message", "agent")
    assert_equal "muse", response.parsed_body.dig("message", "authenticated_actor")
    @muse.update!(scope: "qa")
    assert_raises(Qa::OfficeActorPolicy::Denied) { Qa::OfficeWork.identity(@owner, @muse) }
  end

  test "public proposals do not pin or enter accepted work" do
    get "/api/csrf"
    headers = { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
    with_build do
      post "/api/qa/pin", params: { revision: @revision, reason: "Untrusted proposed build" }, headers:, as: :json
      assert_response :ok
      assert_equal false, response.parsed_body.fetch("coordination_gate")
      assert_nil Qa::Snapshot.find_by(key: "pin")
      post "/api/qa/tasks", params: { task: @input.merge(kind: "qa_run") }, headers:, as: :json
      assert_response :created
      assert_equal "proposed", response.parsed_body["status"]
      post "/api/qa/tasks", params: { task: @input.merge(kind: "qa_run", title: "Changed proposal") }, headers:, as: :json
      assert_response :conflict
    end
    assert_empty Qa::Task.where(status: "queued")
  end

  test "generic reports cannot forge Office or claim history and changed retry conflicts" do
    @muse.update!(scope: "qa")
    input = { kind: "office_actor_updated", summary: "Forged check-in", revision: @revision, event_key: "office:muse:forged" }
    post "/api/qa/events", params: { event: input }, headers: { "Authorization" => "Bearer #{@muse_raw}" }, as: :json
    assert_response :unprocessable_entity
    input[:kind] = "note"
    input[:event_key] = "claim:forged"
    post "/api/qa/events", params: { event: input }, headers: { "Authorization" => "Bearer #{@muse_raw}" }, as: :json
    assert_response :created
    assert_equal "reported_note", response.parsed_body["kind"]
    assert_not Qa::Event.exists?(event_key: "claim:forged")
    post "/api/qa/events", params: { event: input.merge(summary: "Changed report") }, headers: { "Authorization" => "Bearer #{@muse_raw}" }, as: :json
    assert_response :conflict
  end

  test "fingerprint enrollment is owner-approved scoped and cannot replace a bound actor" do
    @muse.update!(revoked_at: Time.current)
    raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    input = { "request_key" => "owner-approve-fingerprint", "actor" => "muse", "digest" => Digest::SHA256.hexdigest(raw), "name" => "Verified Muse runtime", "cadence_seconds" => 60 }
    post "/api/qa/office/enrollments", params: { enrollment: input }, headers: { "Authorization" => "Bearer #{@dot_raw}" }, as: :json
    assert_response :forbidden
    receipt = Qa::OfficeEnrollment.approve(user: @owner, input:)
    assert_equal "office", receipt[:scope]
    token = Qa::ServiceToken.authenticate(raw)
    assert token.office?
    assert_equal "muse", Qa::OfficeWork.identity(@owner, token)[:name]
    assert_equal 60000, Qa::OfficeActors.read[:muse_cadence_ms]
    assert_equal receipt.stringify_keys, Qa::OfficeEnrollment.approve(user: @owner, input:)
    assert_raises(Qa::OfficeWork::Conflict) { Qa::OfficeEnrollment.approve(user: @owner, input: input.merge("request_key" => "replace-without-revocation", "digest" => "c" * 64)) }
    token.update!(revoked_at: Time.current)
    assert_nil Qa::ServiceToken.authenticate(raw)
    assert_nil Qa::OfficeActors.read[:actors].find { |item| item[:id] == "muse" }[:receipt]
  end
  test "four principals hand off one task and owner decisions retain recorded history" do
    codex_raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    codex = Qa::ServiceToken.create!(user: @owner, recipient: "codex", scope: "office", name: "Actual Codex", digest: Digest::SHA256.hexdigest(codex_raw))
    ENV["QA_OFFICE_CODEX_TOKEN_ID"] = codex.id.to_s
    send_request
    id = response.parsed_body.fetch("id")
    advance(id, "picked_up")
    assert_response :success
    assert_nil Qa::Task.find(id).lease_expires_at
    advance(id, "acknowledged")
    assert_response :success
    assert Qa::Task.find(id).lease_expires_at.between?(14.minutes.from_now, 16.minutes.from_now)
    advance(id, "blocked", result: { summary: "Need Joshua's direction" })
    assert_response :success
    decision = Qa::OfficeWork.transition(user: @owner, token: nil, id:, input: { "request_key" => "owner-specific-decision", "status" => "decision", "result" => { "summary" => "Report read-only capability" } })
    assert_equal "blocked", decision["office_status"]
    assert_equal "Report read-only capability", decision.dig("payload", "owner_decision")
    advance(id, "handoff", result: { summary: "Codex can inspect the local implementation" }, assignee: "codex")
    assert_response :success
    assert_equal "queued", response.parsed_body["status"]
    assert_equal "codex", response.parsed_body.dig("payload", "assigned_actor")
    assert_nil Qa::Task.find(id).claim_principal
    advance(id, "acknowledged", @dot_raw, key: "dot-cannot-claim-codex")
    assert_response :forbidden
    advance(id, "acknowledged", codex_raw, key: "codex-acknowledges-handoff")
    assert_response :success
    post "/api/qa/room/messages", params: { message: { message_key: "codex-author-without-client-name", recipient: "Muse", body: "Checking the assigned handoff", task_id: id } }, headers: { "Authorization" => "Bearer #{codex_raw}" }, as: :json
    assert_response :created
    assert_equal "Codex", response.parsed_body.dig("message", "agent")
    advance(id, "completed", codex_raw, result: { summary: "Read-only capability verified" })
    assert_response :success
    advance(id, "result_confirmed", @dot_raw)
    assert_response :success
    get "/api/qa/office/work"
    receipts = response.parsed_body["tasks"].find { |task| task["id"] == id }.fetch("receipts")
    assert_equal %w[submitted picked_up acknowledged blocked decision handoff acknowledged completed result_confirmed], receipts.map { |receipt| receipt["status"] }
    assert_equal %w[dot muse muse muse josh muse codex codex dot], receipts.map { |receipt| receipt["actor"] }
    assert receipts.all? { |receipt| receipt["created_at"].present? }
    assert_equal id, Qa::Task.find_by!(request_key: @input[:request_key]).id
  end
end
