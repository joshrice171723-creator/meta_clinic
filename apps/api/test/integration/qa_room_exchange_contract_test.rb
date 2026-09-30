require "test_helper"

class QaRoomExchangeContractTest < ActionDispatch::IntegrationTest
  REVISION = ("a" * 40).freeze
  PASSWORD = "Synthetic-room-contract-only!".freeze

  setup do
    @dot = User.create!(email_address: "dot-room-contract@example.invalid", password: PASSWORD, platform_owner: true)
    @muse_fixture = User.create!(email_address: "muse-room-contract@example.invalid", password: PASSWORD, platform_owner: true)
    # Only rollback-isolated test authentication. No live token/account is provisioned.
    @raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    @token = Qa::ServiceToken.create!(user: @muse_fixture, name: "Synthetic contract fixture", recipient: "muse", digest: Digest::SHA256.hexdigest(@raw))
    @original_build = Qa::Workspace.method(:build)
    Qa::Workspace.define_singleton_method(:build) { { "revision" => REVISION, "dirty" => false } }
    @task = Qa::Task.create!(user: @dot, kind: "retest", recipient: "muse", title: "Untouched synthetic task", revision: REVISION, request_key: SecureRandom.uuid)
    @task_before = @task.attributes
    @nonce = "synthetic_contract_nonce"
  end

  teardown do
    Qa::Workspace.define_singleton_method(:build, @original_build)
  end

  test "browser send carrier reply and browser acknowledgment correlate without executing tasks" do
    sign_in
    post_message(message("Dot", "Muse", "Synthetic handshake; reply only"), csrf_headers)
    assert_response :created
    root = response.parsed_body
    assert_receipt(root, author: @dot, source: "owner_session")
    assert_equal root.fetch("id"), root.fetch("thread_id")

    get "/api/qa/room", params: { after_id: root.fetch("id") - 1 }, headers: carrier_headers
    assert_response :success
    page = response.parsed_body
    assert_equal true, page.fetch("can_post")
    assert_equal root, page.fetch("messages").sole
    assert_equal root.fetch("id"), page.fetch("next_cursor")
    assert_equal false, page.fetch("has_more")

    reply_input = message("Muse", "Dot", "Synthetic nonce read; read/post capability reported", reply_to: root.fetch("id"))
    post_message(reply_input, carrier_headers)
    assert_response :created
    reply = response.parsed_body
    assert_receipt(reply, author: @muse_fixture, source: "qa_service:muse")
    assert_equal root.fetch("id"), reply.dig("message", "reply_to")
    assert_equal root.fetch("thread_id"), reply.fetch("thread_id")
    assert_equal @nonce, reply.dig("message", "correlation_nonce")
    assert_no_difference "Qa::Event.count" do
      post_message(reply_input, carrier_headers)
      assert_response :created
      assert_equal reply, response.parsed_body
    end

    get "/api/qa/room", params: { after_id: root.fetch("id") }
    assert_response :success
    assert_equal reply, response.parsed_body.fetch("messages").sole
    post_message(message("Dot", "Muse", "Synthetic acknowledgment; no workflow run", reply_to: reply.fetch("id")), csrf_headers)
    assert_response :created
    acknowledgment = response.parsed_body
    assert_receipt(acknowledgment, author: @dot, source: "owner_session")
    assert_equal reply.fetch("id"), acknowledgment.dig("message", "reply_to")
    assert_equal root.fetch("id"), acknowledgment.fetch("thread_id")
    assert_equal @nonce, acknowledgment.dig("message", "correlation_nonce")
    assert_equal @task_before, @task.reload.attributes
    assert_equal root.fetch("message"), Qa::Event.find(root.fetch("id")).reload.payload
    assert_equal reply.fetch("message"), Qa::Event.find(reply.fetch("id")).reload.payload
  end

  test "public cursor pickup reaches a correlated reply beyond the first page and empty reads retain the cursor" do
    root = Qa::AgentRoom.post(@dot, message("Dot", "Muse", "Synthetic paged handshake").stringify_keys, source: "owner_session")
    101.times do |number|
      Qa::Workspace.event(user: @dot, kind: Qa::AgentRoom::KIND, summary: "Unrelated synthetic message #{number}",
        payload: { "agent" => "Fixture", "recipient" => "Other", "body" => "Synthetic unrelated coordination" })
    end
    reply = Qa::AgentRoom.post(@muse_fixture,
      message("Muse", "Dot", "Synthetic paged reply", reply_to: root.fetch(:id)).stringify_keys, source: "qa_service:muse")
    cursor = root.fetch(:id) - 1
    get "/api/qa/room", params: { after_id: cursor }
    assert_response :success
    first = response.parsed_body
    assert_equal false, first.fetch("can_post")
    assert_equal 100, first.fetch("messages").length
    assert_equal true, first.fetch("has_more")
    refute_includes first.fetch("messages").map { |item| item.fetch("id") }, reply.fetch(:id)
    get "/api/qa/room", params: { after_id: first.fetch("next_cursor") }
    assert_response :success
    last = response.parsed_body
    assert_equal 3, last.fetch("messages").length
    assert_equal false, last.fetch("has_more")
    received = last.fetch("messages").last
    assert_equal reply.fetch(:id), received.fetch("id")
    assert_equal root.fetch(:id), received.dig("message", "reply_to")
    assert_equal @nonce, received.dig("message", "correlation_nonce")
    assert_equal "Dot", received.dig("message", "recipient")
    assert_no_difference "Qa::Event.count" do
      get "/api/qa/room", params: { after_id: last.fetch("next_cursor") }
      assert_response :success
      assert_empty response.parsed_body.fetch("messages")
      assert_equal last.fetch("next_cursor"), response.parsed_body.fetch("next_cursor")
      assert_equal false, response.parsed_body.fetch("has_more")
    end
    assert_equal @task_before, @task.reload.attributes
  end

  test "public read and self reported Muse label never grant reply authority" do
    get "/api/qa/room", params: { after_id: 0 }
    assert_response :success
    assert_equal false, response.parsed_body.fetch("can_post")
    reply = message("Muse", "Dot", "Synthetic unprivileged reply")
    assert_no_difference "Qa::Event.count" do
      post_message(reply, csrf_headers)
      assert_response :unauthorized
      @token.update!(revoked_at: Time.current)
      post_message(reply, carrier_headers)
      assert_response :unauthorized
      @muse_fixture.update!(active: false)
      @token.update!(revoked_at: nil)
      post_message(reply, carrier_headers)
      assert_response :unauthorized
    end
    assert_equal @task_before, @task.reload.attributes
  end

  private

  def message(agent, recipient, body, reply_to: nil)
    { message_key: SecureRandom.uuid, agent: agent, recipient: recipient, body: body,
      correlation_nonce: @nonce, reference_revision: REVISION }.tap { |input| input[:reply_to] = reply_to if reply_to }
  end

  def post_message(input, headers)
    post "/api/qa/room/messages", params: { message: input }, headers:, as: :json
  end

  def assert_receipt(receipt, author:, source:)
    assert_equal "persisted", receipt.fetch("delivery")
    assert_equal author.id, receipt.fetch("authenticated_author_id")
    assert_equal source, receipt.dig("message", "authenticated_source")
    assert_equal "self_reported", receipt.dig("message", "identity")
    assert_equal "reported", receipt.dig("message", "provenance")
    assert_equal REVISION, receipt.fetch("revision")
    assert_equal REVISION, receipt.dig("message", "reference_revision")
    assert_equal @nonce, receipt.dig("message", "correlation_nonce")
  end

  def carrier_headers
    { "Authorization" => "Bearer #{@raw}" }
  end

  def sign_in
    post "/api/session", params: { email_address: @dot.email_address, password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end
end
