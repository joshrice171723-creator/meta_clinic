require "test_helper"

class QaOfficeActorsTest < ActionDispatch::IntegrationTest
  setup do
    @config_keys = %w[QA_OFFICE_ACTORS_ENABLED QA_OFFICE_JOSH_USER_ID QA_OFFICE_MUSE_TOKEN_ID QA_OFFICE_DOT_TOKEN_ID QA_OFFICE_MUSE_CADENCE_SECONDS]
    @saved_config = @config_keys.to_h { |key| [ key, ENV[key] ] }
    @config_keys.each { |key| ENV.delete(key) }
    @owner = User.create!(email_address: "office-actors-owner@example.invalid", password: "Synthetic-office-actors-only!", platform_owner: true)
    # Independently synthetic credentials stay inside this isolated test process.
    @muse_raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    @dot_raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    @muse = Qa::ServiceToken.create!(user: @owner, name: "Synthetic Muse", recipient: "muse", digest: Digest::SHA256.hexdigest(@muse_raw))
    @dot = Qa::ServiceToken.create!(user: @owner, name: "Synthetic dot", recipient: "codex", digest: Digest::SHA256.hexdigest(@dot_raw))
  end

  teardown do
    @saved_config.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  def enable_bindings
    ENV["QA_OFFICE_ACTORS_ENABLED"] = "1"
    ENV["QA_OFFICE_JOSH_USER_ID"] = @owner.id.to_s
    ENV["QA_OFFICE_MUSE_TOKEN_ID"] = @muse.id.to_s
    ENV["QA_OFFICE_DOT_TOKEN_ID"] = @dot.id.to_s
  end

  def write(raw, kind, fields)
    endpoint, key = kind == "position" ? [ "position", "position" ] : [ "check-ins", "check_in" ]
    post "/api/qa/office/#{endpoint}", params: { key => fields }, headers: { "Authorization" => "Bearer #{raw}" }, as: :json
  end

  test "existing tokens cannot activate writes and public visitors cannot claim actors" do
    count = Qa::Snapshot.count
    write(@muse_raw, "position", { x: 5, y: 4, expected_revision: 0, request_key: "disabled-request" })
    assert_response :forbidden
    assert_equal count, Qa::Snapshot.count
    enable_bindings
    post "/api/qa/office/position", params: { position: { actor: "muse", x: 5, y: 4, expected_revision: 0, request_key: "visitor-request" } }, as: :json
    assert_includes [ 401, 422 ], response.status
    assert_nil Qa::Snapshot.find_by(key: "office:actors")
  end

  test "positions belong to verified principals and stale or forged writes cannot overwrite them" do
    enable_bindings
    fields = { x: 5, y: 4, expected_revision: 0, request_key: "position-request" }
    write(@muse_raw, "position", fields)
    assert_response :success
    first = response.parsed_body
    assert_equal "muse", first["actor"]
    assert_equal 1, first["revision"]
    assert_nil first["receipt"]
    write(@muse_raw, "position", fields)
    assert_response :success
    assert_equal first, response.parsed_body
    write(@muse_raw, "position", fields.merge(x: 6, request_key: "stale-request"))
    assert_response :conflict
    write(@dot_raw, "position", fields.merge(actor: "muse", request_key: "forged-request"))
    assert_response :unprocessable_entity
    write(@dot_raw, "position", fields.merge(request_key: "dot-position-request"))
    assert_response :success
    assert_equal "dot", response.parsed_body["actor"]
    get "/api/qa/office/actors"
    assert_response :success
    assert_nil response.parsed_body["controlled_actor"]
    actors = response.parsed_body["actors"].index_by { |item| item["id"] }
    assert_equal({ "x" => 5, "y" => 4 }, actors["muse"]["position"])
    assert_equal 1, actors["muse"]["revision"]
    assert_not_includes response.body, "principal_key"
    assert_not_includes response.body, @muse_raw
  end

  test "only a new authenticated check-in creates a new server timestamp and id" do
    enable_bindings
    fields = { expected_revision: 0, request_key: "receipt-request" }
    write(@muse_raw, "check_in", fields)
    assert_response :success
    first = response.parsed_body
    assert_equal first["principal_id"], first.dig("receipt", "authenticatedActorId")
    assert first.dig("receipt", "receivedAtMs").between?(1.minute.ago.to_i * 1000, 1.minute.from_now.to_i * 1000)
    write(@muse_raw, "check_in", fields)
    assert_response :success
    assert_equal first, response.parsed_body
    write(@muse_raw, "check_in", fields.merge(expected_revision: 1, request_key: "next-receipt-request"))
    assert_response :success
    assert_not_equal first.dig("receipt", "id"), response.parsed_body.dig("receipt", "id")
    write(@muse_raw, "check_in", fields.merge(receivedAtMs: 999_999_999, request_key: "forged-clock-request"))
    assert_response :unprocessable_entity
    get "/api/qa/office/actors", headers: { "Authorization" => "Bearer #{@muse_raw}" }
    assert_response :success
    assert_equal "muse", response.parsed_body["controlled_actor"]
    assert_nil response.parsed_body["muse_cadence_ms"]
  end

  test "revocation hides old positions and receipts and denies further writes" do
    enable_bindings
    write(@muse_raw, "check_in", { expected_revision: 0, request_key: "before-revocation" })
    assert_response :success
    @muse.update!(revoked_at: Time.current)
    get "/api/qa/office/actors"
    item = response.parsed_body["actors"].find { |row| row["id"] == "muse" }
    assert_equal "uncontrolled", item["control"]
    assert_nil item["receipt"]
    assert_nil item["principal_id"]
    write(@muse_raw, "check_in", { expected_revision: 1, request_key: "after-revocation" })
    assert_includes [ 401, 422 ], response.status
  end

  test "owner session policy maps only designated Josh without service impersonation" do
    enable_bindings
    result = Qa::OfficeActors.write(user: @owner, token: nil, kind: "position", input: { "x" => 2, "y" => 4, "expected_revision" => 0, "request_key" => "owner-position" })
    assert_equal "josh", result["actor"]
    # Keep the one-platform-owner guard intact while testing a wrong mapping.
    ENV["QA_OFFICE_JOSH_USER_ID"] = (@owner.id + 10_000).to_s
    assert_raises(Qa::OfficeActorPolicy::Denied) { Qa::OfficeActors.write(user: @owner, token: nil, kind: "check_in", input: { "expected_revision" => 0, "request_key" => "wrong-owner-mapping" }) }
    ENV["QA_OFFICE_JOSH_USER_ID"] = @owner.id.to_s
    get "/api/qa/office"
    assert_response :success
    assert_equal "not_configured", response.parsed_body["actor_binding"]
    assert_nil response.parsed_body["receipts"]
  end
end
