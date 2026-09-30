require "test_helper"

class QaOfficeTest < ActionDispatch::IntegrationTest
  REVISION = ("a" * 40).freeze

  setup do
    @owner = User.create!(email_address: "office-owner@example.invalid", password: "Synthetic-office-only!", platform_owner: true)
    @task = Qa::Task.create!(user: @owner, kind: "retest", recipient: "muse", title: "Synthetic QA task",
      revision: REVISION, request_key: SecureRandom.uuid, status: "claimed", claimed_by: @owner,
      claim_run_id: "synthetic-run", claimed_at: Time.current)
    @event = Qa::Event.create!(user: @owner, kind: "agent_room_message", summary: "Reported reply",
      revision: REVISION, event_key: SecureRandom.uuid, payload: { agent: "Muse", identity: "self_reported" })
    @evidence = Qa::Evidence.create!(user: @owner, issue_number: 1, caption: "Synthetic stored evidence",
      revision: REVISION, content_type: "image/png", phase: "observation", image: "synthetic-image", digest: Digest::SHA256.hexdigest("synthetic-image"))
    Qa::Snapshot.put("state", { "last_run_at" => Time.current.iso8601,
      "scheduler" => { "status" => "active", "next_run_at" => 1.minute.from_now.iso8601 } })
    @original_build = Qa::Workspace.method(:build)
    Qa::Workspace.define_singleton_method(:build) { { "revision" => REVISION, "dirty" => false } }
  end

  teardown do
    Qa::Workspace.define_singleton_method(:build, @original_build)
  end

  test "public office projects stored QA records without writing or inferring actor receipts" do
    before = [ Qa::Task, Qa::Evidence, Qa::Event, Qa::Snapshot, User ].to_h { |model| [ model, model.order(:id).map(&:attributes) ] }
    get "/api/qa/office"
    assert_response :success
    body = response.parsed_body
    assert_equal %w[actor_binding actor_state actors build cadence contract_version events evidence messages receipts tasks], body.keys.sort
    assert_equal 1, body["contract_version"]
    assert_equal "not_configured", body["actor_binding"]
    assert_nil body["receipts"]
    assert_nil body["cadence"]
    assert_equal [ [ "josh", "Josh" ], [ "muse", "Muse" ], [ "dot", "dot" ] ].map { |id, name|
      { "id" => id, "name" => name, "connection" => "not_connected", "control" => "uncontrolled", "position" => nil }
    }, body["actors"]
    assert_equal REVISION, body.dig("build", "revision")
    assert_equal @task.id, body["tasks"].first["id"]
    assert_equal @event.id, body["events"].first["id"]
    assert_equal @evidence.id, body["evidence"].first["id"]
    assert_equal "/api/qa/evidence/#{@evidence.id}", body["evidence"].first["url"]
    assert_not body["evidence"].first.key?("image")
    before.each { |model, records| assert_equal records, model.order(:id).map(&:attributes) }
  end

  test "office keeps existing token task scope and never exposes token or account authentication fields" do
    codex = Qa::Task.create!(user: @owner, kind: "retest", recipient: "codex", title: "Synthetic Codex task",
      revision: REVISION, request_key: SecureRandom.uuid)
    raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    token = Qa::ServiceToken.create!(user: @owner, name: "Synthetic Office token", recipient: "muse", digest: Digest::SHA256.hexdigest(raw))
    get "/api/qa/office", headers: { "Authorization" => "Bearer #{raw}" }
    assert_response :success
    assert_equal [ @task.id ], response.parsed_body["tasks"].map { |task| task["id"] }
    assert_nil response.parsed_body["receipts"]
    assert_nil response.parsed_body["cadence"]
    [ raw, token.digest, @owner.password_digest, "password_digest", "service_token" ].each do |private_value|
      assert_not_includes response.body, private_value
    end
    token.update!(revoked_at: Time.current)
    get "/api/qa/office", headers: { "Authorization" => "Bearer #{raw}" }
    assert_response :success
    assert_equal [ @task.id, codex.id ].sort, response.parsed_body["tasks"].map { |task| task["id"] }.sort
  end

  test "missing build identity stays unavailable without inventing an actor connection" do
    Qa::Workspace.define_singleton_method(:build) { { "revision" => nil, "observed_at" => nil } }
    get "/api/qa/office"
    assert_response :success
    assert_nil response.parsed_body.dig("build", "revision")
    assert response.parsed_body["actors"].all? { |actor| actor["connection"] == "not_connected" && actor["position"].nil? }
    assert_nil response.parsed_body["receipts"]
    assert_nil response.parsed_body["cadence"]
  end
end
