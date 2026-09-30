require "test_helper"

class QaAgentRoomTest < ActionDispatch::IntegrationTest
  REVISION = ("a" * 40).freeze
  PASSWORD = "Synthetic-room-only!".freeze

  setup do
    @owner = User.create!(email_address: "room-owner@example.invalid", password: PASSWORD, platform_owner: true)
    @build = { "revision" => REVISION, "dirty" => false }
    @input = { message_key: SecureRandom.uuid, agent: "Dot", recipient: "Muse", body: "Read-only synthetic handshake nonce: invented-123",
      reference_revision: "b" * 40, correlation_nonce: "synthetic_nonce123", case_reference: "Muse #218 (reported, full observed SHA unknown)" }
    @original_build = Qa::Workspace.method(:build)
    build = -> { @build }
    Qa::Workspace.define_singleton_method(:build) { build.call }
  end

  teardown do
    Qa::Workspace.define_singleton_method(:build, @original_build)
  end

  def csrf_headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  def sign_in(user = @owner)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def post_message(headers = csrf_headers)
    post "/api/qa/room/messages", params: { message: @input }, headers:, as: :json
  end

  test "public reads do not imply posting permission" do
    get "/api/qa/room"
    assert_response :success
    assert_equal false, response.parsed_body["can_post"]
    assert_no_difference "Qa::Event.count" do
      post_message
      assert_response :unauthorized
    end
    admin = User.create!(email_address: "room-admin@example.invalid", password: PASSWORD, admin: true)
    sign_in(admin)
    post_message
    assert_response :forbidden
  end

  test "owner browser CSRF active-account guards are preserved" do
    sign_in
    post_message({})
    assert_response :unprocessable_entity
    @owner.update!(active: false)
    post_message
    assert_response :unauthorized
  end

  test "persisted messages carry provenance and separate historical build references without changing tasks" do
    sign_in
    task = Qa::Task.create!(user: @owner, kind: "retest", recipient: "muse", title: "Historical task", revision: "b" * 40, request_key: SecureRandom.uuid)
    original_task = task.attributes
    @input[:task_id] = task.id
    @input[:authenticated_source] = "Muse connected"
    assert_difference "Qa::Event.count", 1 do
      assert_no_difference "Qa::Task.count" do
        post_message
        assert_response :created
      end
    end
    receipt = response.parsed_body
    assert_equal "persisted", receipt["delivery"]
    assert_equal @owner.id, receipt["authenticated_author_id"]
    assert_equal task.id, receipt.dig("message", "task_id")
    assert_equal "reported", receipt.dig("message", "provenance")
    assert_equal "self_reported", receipt.dig("message", "identity")
    assert_equal "owner_session", receipt.dig("message", "authenticated_source")
    assert_equal REVISION, receipt["revision"]
    assert_equal "b" * 40, receipt.dig("message", "reference_revision")
    assert_equal original_task, task.reload.attributes
    get "/api/qa/room"
    assert_equal receipt, response.parsed_body["messages"].find { |item| item["id"] == receipt["id"] }
  end

  test "matching retry preserves original server receipt but key collision does not replace history" do
    sign_in
    post_message
    first = response.parsed_body
    @build = { "revision" => "c" * 40, "dirty" => true }
    assert_no_difference "Qa::Event.count" do
      post_message
      assert_response :created
      assert_equal first, response.parsed_body
      @input[:body] = "Different synthetic text"
      post_message
      assert_response :conflict
    end
    assert Qa::Event.find(first["id"]).readonly?
  end

  test "reply threads derive roots and reject nonexistent or unrelated parent ids" do
    sign_in
    post_message
    root = response.parsed_body
    @input.merge!(message_key: SecureRandom.uuid, agent: "Muse", recipient: "Dot", reply_to: root["id"], body: "Explicit response: invented-123; no workflow run")
    post_message
    assert_response :created
    reply = response.parsed_body
    assert_equal root["id"], reply["thread_id"]
    assert_equal root["id"], reply.dig("message", "reply_to")
    assert_equal "synthetic_nonce123", reply.dig("message", "correlation_nonce")
    @input.merge!(message_key: SecureRandom.uuid, reply_to: reply["id"])
    post_message
    assert_equal root["id"], response.parsed_body["thread_id"]
    unrelated = Qa::Workspace.event(user: @owner, kind: "agent_heartbeat", summary: "Synthetic")
    @input.merge!(message_key: SecureRandom.uuid, reply_to: unrelated.id)
    post_message
    assert_response :unprocessable_entity
  end

  test "unavailable or dirty build remains visible and never fabricates an exact-build verdict" do
    sign_in
    @build = { "revision" => nil }
    post_message
    assert_response :created
    assert_nil response.parsed_body["revision"]
    assert_equal false, response.parsed_body.dig("message", "build_available")
    @build = { "revision" => REVISION, "dirty" => true }
    @input[:message_key] = SecureRandom.uuid
    post_message
    assert_nil response.parsed_body["revision"]
    assert_equal true, response.parsed_body.dig("message", "build_dirty")
  end

  test "existing service tokens can post but revoked credentials cannot" do
    raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    token = Qa::ServiceToken.create!(user: @owner, name: "Synthetic room token", recipient: "muse", digest: Digest::SHA256.hexdigest(raw))
    post_message("Authorization" => "Bearer #{raw}")
    assert_response :created
    assert_equal "qa_service:muse", response.parsed_body.dig("message", "authenticated_source")
    token.update!(revoked_at: Time.current)
    @input[:message_key] = SecureRandom.uuid
    post_message(csrf_headers.merge("Authorization" => "Bearer #{raw}"))
    assert_response :unauthorized
  end

  test "bounded inputs secrets generic event forgery and post rate are rejected" do
    sign_in
    original = @input.dup
    [ { body: "x" * 2001 }, { agent: " " }, { reference_revision: "short" }, { body: "qa_#{'x' * 43}" }, { body: "PIN=1234" }, { reply_to: "1" }, { correlation_nonce: "bad nonce" }, { task_id: "1" }, { evidence_refs: [0] } ].each do |invalid|
      @input = original.merge(invalid)
      assert_no_difference "Qa::Event.count" do
        post_message
        assert_response :unprocessable_entity
      end
    end
    post "/api/qa/events", params: { event: { kind: Qa::AgentRoom::KIND, revision: REVISION, summary: "Forged" } }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    30.times { |n| Qa::Workspace.event(user: @owner, kind: Qa::AgentRoom::KIND, summary: "Synthetic #{n}") }
    @input = original
    post_message
    assert_response :conflict
    get "/api/qa/room"
    assert response.parsed_body["messages"].length <= 100
  end

  test "cursor polling returns each page and keeps its position when there are no new messages" do
    ids = 103.times.map do |n|
      Qa::Workspace.event(user: @owner, kind: Qa::AgentRoom::KIND, summary: "Synthetic #{n}").id
    end
    get "/api/qa/room", params: { after_id: 0 }
    assert_response :success
    first = response.parsed_body
    assert_equal ids.first(100), first["messages"].map { |item| item["id"] }
    assert_equal true, first["has_more"]
    get "/api/qa/room", params: { after_id: first["next_cursor"] }
    second = response.parsed_body
    assert_equal ids.last(3), second["messages"].map { |item| item["id"] }
    assert_equal false, second["has_more"]
    get "/api/qa/room", params: { after_id: second["next_cursor"] }
    assert_empty response.parsed_body["messages"]
    assert_equal ids.last, response.parsed_body["next_cursor"]
    get "/api/qa/room", params: { after_id: "-1" }
    assert_response :unprocessable_entity
  end

  test "credential shaped text cannot enter any public message field or event key" do
    sign_in
    original = @input.dup
    fake_credential = "qa_#{'x' * 43}"
    %i[message_key agent recipient body case_reference correlation_nonce reference_revision task_id evidence_refs reply_to].each do |field|
      @input = original.merge(field => fake_credential)
      assert_no_difference "Qa::Event.count", "credential accepted in #{field}" do
        post_message
        assert_response :unprocessable_entity
      end
    end
  end

  test "a late unique key winner from another author never becomes the callers receipt" do
    sign_in
    post_message
    winner = Qa::Event.find(response.parsed_body.fetch("id"))
    original_winner = winner.attributes
    # Both owners can have passed authorization on either side of an ownership
    # transfer. Force the second lookup miss to model the winning insert landing
    # between that lookup and create_or_find_by!; PostgreSQL resolves the key.
    @owner.update!(platform_owner: false)
    other = User.create!(email_address: "room-race-owner@example.invalid", password: PASSWORD, platform_owner: true)
    sign_in(other)
    original_find = Qa::Event.method(:find_by)
    missed = false
    key = "room:#{@input[:message_key]}"
    Qa::Event.define_singleton_method(:find_by) do |*args, **kwargs|
      conditions = kwargs.empty? ? args.first : kwargs
      if !missed && conditions == { event_key: key }
        missed = true
        nil
      else
        original_find.call(*args, **kwargs)
      end
    end
    assert_no_difference "Qa::Event.count" do
      post_message
      assert_response :conflict
    end
    assert missed, "the initial lookup must miss to exercise the database collision path"
    assert_equal original_winner, winner.reload.attributes
    assert_nil response.parsed_body["authenticated_author_id"]
  ensure
    Qa::Event.define_singleton_method(:find_by, original_find) if original_find
  end
end
