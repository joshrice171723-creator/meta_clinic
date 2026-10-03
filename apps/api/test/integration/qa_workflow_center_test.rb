require "test_helper"

class QaWorkflowCenterBoundaryTest < ActionDispatch::IntegrationTest
  test "new endpoints remain closed to an existing server-bound Office principal" do
    owner = User.create!(email_address: "workflow-boundary@example.invalid", password: "Synthetic-workflow-only!", platform_owner: true, active: true)
    raw = "qa_#{SecureRandom.urlsafe_base64(32)}"
    token = Qa::ServiceToken.create!(user: owner, name: "Synthetic boundary credential", recipient: "muse", scope: "office", digest: Digest::SHA256.hexdigest(raw))
    Qa::Snapshot.put("office:bindings", { "config" => { "QA_OFFICE_ACTORS_ENABLED" => "1", "QA_OFFICE_MUSE_TOKEN_ID" => token.id.to_s } })
    assert_no_difference ["Qa::Event.count", "Qa::Snapshot.count"] do
      %w[claims evidence].each do |action|
        post "/api/qa/workflow-center/#{action}", params: {}, headers: { "Authorization" => "Bearer #{raw}" }, as: :json
        assert_response :forbidden
        assert_includes response.parsed_body["error"], "not activated"
      end
    end
  end

  test "invalid credentials do not fall through to a public writer" do
    get "/api/csrf"
    headers = { "Authorization" => "Bearer invalid-synthetic-value", "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
    assert_no_difference ["Qa::Event.count", "Qa::Snapshot.count"] do
      post "/api/qa/workflow-center/claims", params: {}, headers:, as: :json
      assert_response :forbidden
    end
  end
end
