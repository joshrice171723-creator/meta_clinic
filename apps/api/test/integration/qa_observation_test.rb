require "test_helper"

class QaObservationTest < ActionDispatch::IntegrationTest
  REVISION = ("a" * 40).freeze
  PASSWORD = "Synthetic-observation-only!".freeze

  setup do
    Rails.cache.clear
    @owner = User.create!(email_address: "observation-owner@example.invalid", password: PASSWORD, platform_owner: true)
    @build = { "revision" => REVISION, "dirty" => false }
    Qa::Snapshot.put("pin", { "revision" => REVISION })
    @task = Qa::Task.create!(user: @owner, kind: "qa_run", recipient: "muse", title: "Synthetic queued task",
      revision: REVISION, request_key: SecureRandom.uuid)
    @input = { kind: "observation_recorded", event_key: SecureRandom.uuid, revision: REVISION,
      summary: "Synthetic reload readback", payload: { provenance: "observed", details: "Synthetic field remained after reload.", task_id: @task.id } }
  end

  def csrf_headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  def sign_in(user = @owner)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def with_build(build)
    original = Qa::Workspace.method(:build)
    Qa::Workspace.define_singleton_method(:build) { build.respond_to?(:call) ? build.call : build }
    yield
  ensure
    Qa::Workspace.define_singleton_method(:build, original)
  end

  def record(headers = csrf_headers, build = @build)
    with_build(build) do
      post "/api/qa/events", params: { event: @input }, headers:, as: :json
    end
  end

  def assert_denied(status)
    assert_no_difference "Qa::Event.count" do
      record
      assert_response status
    end
  end

  test "anonymous and ordinary administrators cannot record observations" do
    assert_denied(:unauthorized)
    admin = User.create!(email_address: "observation-admin@example.invalid", password: PASSWORD, admin: true)
    sign_in(admin)
    assert_denied(:forbidden)
  end

  test "inactive owners and browser requests without CSRF are denied" do
    sign_in
    assert_no_difference "Qa::Event.count" do
      record({})
      assert_response :unprocessable_entity
    end
    @owner.update!(active: false)
    assert_denied(:unauthorized)
  end

  test "the workspace projects the observation capability only to an active owner session" do
    original = Qa::Workspace.method(:github)
    Qa::Workspace.define_singleton_method(:github) { |**_options| { "status" => "unavailable", "issues" => [] } }
    with_build(@build) do
      get "/api/qa"
      assert_response :success
      assert_equal false, response.parsed_body.dig("capabilities", "record_observation")
      sign_in
      get "/api/qa"
      assert_response :success
      assert_equal true, response.parsed_body.dig("capabilities", "record_observation")
      @owner.update!(active: false)
      get "/api/qa"
      assert_response :success
      assert_equal false, response.parsed_body.dig("capabilities", "record_observation")
    end
  ensure
    Qa::Workspace.define_singleton_method(:github, original)
  end

  test "the existing carrier requires an active owner service token" do
    raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    token = Qa::ServiceToken.create!(user: @owner, name: "Synthetic observation test", recipient: "muse",
      digest: Digest::SHA256.hexdigest(raw))
    record("Authorization" => "Bearer #{raw}")
    assert_response :created
    assert_equal @owner.id, response.parsed_body.fetch("user_id")
    token.update!(revoked_at: Time.current)
    assert_no_difference "Qa::Event.count" do
      record(csrf_headers.merge("Authorization" => "Bearer #{raw}"))
      assert_response :unauthorized
    end
  end

  test "owner receipts preserve provenance and do not change tasks or ledger" do
    sign_in
    Qa::Snapshot.put("state", { "retest" => [ { "id" => "synthetic", "status" => "pending" } ] })
    original = Qa::Snapshot.find_by!(key: "state").data
    @input[:payload][:tester] = "forged@example.invalid"
    assert_difference "Qa::Event.count", 1 do
      record
      assert_response :created
    end
    receipt = response.parsed_body
    assert_equal @owner.id, receipt.fetch("user_id")
    assert_equal REVISION, receipt.fetch("revision")
    assert_equal "observed", receipt.dig("payload", "provenance")
    assert_equal @owner.email_address, receipt.dig("payload", "tester")
    assert_equal @task.id, receipt.dig("payload", "task_id")
    assert_equal "queued", @task.reload.status
    assert_empty @task.result
    assert_equal original, Qa::Snapshot.find_by!(key: "state").data
    assert_empty Qa::Evidence.all
    assert_raises(ActiveRecord::ReadOnlyRecord) { Qa::Event.find(receipt.fetch("id")).update!(summary: "replace") }

    @input[:event_key] = SecureRandom.uuid
    @input[:payload][:provenance] = "reported"
    record
    assert_response :created
    assert_equal "reported", response.parsed_body.dig("payload", "provenance")
  end

  test "missing or mismatched pin and stale dirty or unavailable builds cannot save" do
    sign_in
    Qa::Snapshot.find_by!(key: "pin").destroy!
    assert_denied(:unprocessable_entity)
    Qa::Snapshot.put("pin", { "revision" => "b" * 40 })
    assert_denied(:unprocessable_entity)
    Qa::Snapshot.put("pin", { "revision" => REVISION })
    [ { "revision" => "b" * 40 }, { "revision" => REVISION, "dirty" => true }, { "revision" => nil } ].each do |build|
      @build = build
      assert_denied(:unprocessable_entity)
    end
  end

  test "a build change during the write rolls back the receipt" do
    sign_in
    builds = [ @build, { "revision" => "b" * 40 } ]
    assert_no_difference "Qa::Event.count" do
      record(csrf_headers, -> { builds.shift })
      assert_response :unprocessable_entity
    end
  end

  test "surrounding whitespace cannot route observations around exact-build validation" do
    sign_in
    @input[:kind] = " observation_recorded "
    Qa::Snapshot.find_by!(key: "pin").destroy!
    assert_denied(:unprocessable_entity)
  end

  test "invalid provenance details revision and unrelated task revisions are rejected" do
    sign_in
    @input[:payload][:provenance] = "passed"
    assert_denied(:unprocessable_entity)
    @input[:payload][:provenance] = "observed"
    @input[:payload][:details] = " "
    assert_denied(:unprocessable_entity)
    @input[:payload][:details] = "x" * 5001
    assert_denied(:unprocessable_entity)
    @input[:payload][:details] = "Synthetic details"
    @input[:revision] = "short"
    assert_denied(:unprocessable_entity)
    @input[:revision] = REVISION
    @task.update!(revision: "b" * 40)
    assert_denied(:unprocessable_entity)
  end

  test "same receipt key replays once and rejects changed content or another owner" do
    sign_in
    record
    assert_response :created
    id = response.parsed_body.fetch("id")
    assert_no_difference "Qa::Event.count" do
      record
      assert_response :created
      assert_equal id, response.parsed_body.fetch("id")
    end
    @input[:summary] = "Different observation"
    assert_denied(:unprocessable_entity)
    @input[:summary] = "Synthetic reload readback"
    @owner.update!(platform_owner: false)
    other = User.create!(email_address: "other-observation-owner@example.invalid", password: PASSWORD, platform_owner: true)
    sign_in(other)
    assert_denied(:unprocessable_entity)
  end

  test "text alone cannot complete a claimed task or pass a defect" do
    sign_in
    @task.update!(status: "claimed", claimed_by: @owner, claim_principal: Qa::OfficeActors.principal_key(@owner, nil), lease_expires_at: 30.minutes.from_now,
      claim_run_id: "synthetic-run", claimed_at: Time.current)
    with_build(@build) do
      assert_no_difference "Qa::Event.count" do
        post "/api/qa/tasks/#{@task.id}/transition", headers: csrf_headers, as: :json, params: {
          revision: REVISION, run_id: "synthetic-run", status: "completed",
          result: { summary: "Text alone", defects: [ { id: 1, verdict: "passed", observed: "Synthetic text", evidence_refs: [] } ] }
        }
        assert_response :unprocessable_entity
      end
    end
    assert_equal "claimed", @task.reload.status
  end
end
