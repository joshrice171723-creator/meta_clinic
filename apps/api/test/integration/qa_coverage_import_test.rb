require "test_helper"

class QaCoverageImportTest < ActionDispatch::IntegrationTest
  PASSWORD = "Synthetic-coverage-test-only!".freeze

  setup do
    Rails.cache.clear
    @owner = User.create!(email_address: "coverage-owner@example.invalid", password: PASSWORD, platform_owner: true)
    @baseline = { "coverage" => [ { "id" => "WF-003", "historical" => true } ], "coverage_pointer" => 3,
      "retest" => [ { "id" => "synthetic-existing" } ], "sources" => { "existing" => { "path" => "synthetic.json" } } }
    Qa::Snapshot.put("state", @baseline)
    @content = { workflows: { "WF-001" => { workflow: "WF-001", result: "reported pass" } }, pointer: 1 }.to_json
  end

  def csrf_headers
    get "/api/csrf"
    assert_response :success
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  def sign_in(user = @owner)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def import(headers = csrf_headers)
    post "/api/qa/coverage", params: { content: @content }, headers:, as: :json
  end

  def assert_unchanged
    assert_no_difference [ "Qa::Event.count", "User.count" ] do
      yield
    end
    assert_equal @baseline, Qa::Snapshot.find_by!(key: "state").data
  end

  test "anonymous visitors cannot replace coverage even with valid CSRF" do
    assert_unchanged do
      import
      assert_response :unauthorized
    end
    get "/api/qa/retest.json"
    assert_response :success
  end

  test "ordinary administrators cannot replace coverage" do
    sign_in(User.create!(email_address: "coverage-admin@example.invalid", password: PASSWORD, admin: true))
    assert_unchanged do
      import
      assert_response :forbidden
    end
  end

  test "deactivated owners cannot replace coverage" do
    sign_in
    @owner.update!(active: false)
    assert_unchanged do
      import
      assert_response :unauthorized
    end
  end

  test "owners import historical records while preserving other state" do
    sign_in
    assert_difference "Qa::Event.where(kind: 'coverage_imported').count", 1 do
      import
      assert_response :success
    end
    state = Qa::Snapshot.find_by!(key: "state").data
    assert_equal "WF-001", state.fetch("coverage").first.fetch("id")
    assert_equal true, state.fetch("coverage").first.fetch("historical")
    assert_equal @baseline.fetch("retest"), state.fetch("retest")
    assert_equal @baseline.dig("sources", "existing"), state.dig("sources", "existing")
    assert_equal @owner.email_address, state.dig("sources", "COVERAGE_STATE.json", "imported_by")
    assert_equal @owner.id, Qa::Event.find_by!(kind: "coverage_imported").user_id
  end

  test "owners can import the first persisted coverage snapshot" do
    sign_in
    Qa::Snapshot.find_by!(key: "state").destroy!
    assert_difference "Qa::Snapshot.where(key: 'state').count", 1 do
      import
      assert_response :success
    end
    assert_equal "WF-001", Qa::Snapshot.find_by!(key: "state").data.fetch("coverage").first.fetch("id")
  end

  test "owner browser imports still require CSRF protection" do
    sign_in
    assert_unchanged do
      import({})
      assert_response :unprocessable_entity
    end
  end

  test "active owner service tokens retain coverage import compatibility" do
    raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    Qa::ServiceToken.create!(user: @owner, name: "Synthetic coverage test", recipient: "codex", digest: Digest::SHA256.hexdigest(raw))
    import("Authorization" => "Bearer #{raw}")
    assert_response :success
    assert_equal @owner.id, Qa::Event.find_by!(kind: "coverage_imported").user_id
  end

  test "conflicting workflow aliases leave coverage and receipts unchanged" do
    sign_in
    @content = { workflows: { "WF-001" => { id: "WF-001", workflow: "WF-002" } } }.to_json
    assert_unchanged do
      import
      assert_response :unprocessable_entity
      assert_equal "Workflow id differs from its key.", response.parsed_body.fetch("error")
    end
  end
end
