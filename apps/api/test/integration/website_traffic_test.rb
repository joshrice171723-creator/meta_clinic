require "test_helper"

class WebsiteTrafficTest < ActionDispatch::IntegrationTest
  setup do
    host! "localhost:3000"
    Rails.cache.clear
  end

  test "anonymous public visits persist and retries do not duplicate views" do
    event_id = SecureRandom.uuid
    2.times do
      post "/api/public/page_visits", params: { path: "/joshua", event_id:, referrer_host: "linkedin.com" }, headers: csrf_headers, as: :json
      assert_response :no_content
    end
    assert_equal 1, Platform::PageVisit.where(event_id:).count
    first = Platform::PageVisit.find_by!(event_id:)
    post "/api/public/page_visits", params: { path: "/demo", event_id: SecureRandom.uuid }, headers: csrf_headers, as: :json
    assert_response :no_content
    assert_equal first.visitor_id, Platform::PageVisit.order(:id).last.visitor_id
    report = Platform::WebsiteTraffic.call
    assert_equal 2, report[:views]
    assert_equal 1, report[:visitors]
    assert_equal [ 1, 1 ], report[:pages].map { |page| page[:views] }
    assert_equal 2, report[:daily].sum { |day| day[:views] }
  end

  test "private paths invalid identifiers and full referrer URLs are not retained" do
    assert_no_difference -> { Platform::PageVisit.count } do
      post "/api/public/page_visits", params: { path: "/clinic/patients", event_id: SecureRandom.uuid }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      post "/api/public/page_visits", params: { path: "/demo", event_id: "bad" }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end
    post "/api/public/page_visits", params: { path: "/demo", event_id: SecureRandom.uuid, referrer_host: "https://example.invalid/?private=value" }, headers: csrf_headers, as: :json
    assert_response :no_content
    assert_equal "", Platform::PageVisit.last.referrer_host
  end

  test "CSRF origin and privacy opt outs are respected" do
    assert_no_difference -> { Platform::PageVisit.count } do
      post "/api/public/page_visits", params: { path: "/demo", event_id: SecureRandom.uuid }, as: :json
      assert_response :unprocessable_entity
      post "/api/public/page_visits", params: { path: "/demo", event_id: SecureRandom.uuid }, headers: csrf_headers.merge("Origin" => "https://other.invalid"), as: :json
      assert_response :unprocessable_entity
      post "/api/public/page_visits", params: { path: "/demo", event_id: SecureRandom.uuid }, headers: csrf_headers.merge("DNT" => "1"), as: :json
      assert_response :no_content
      post "/api/public/page_visits", params: { path: "/demo", event_id: SecureRandom.uuid }, headers: csrf_headers.merge("Sec-GPC" => "1"), as: :json
      assert_response :no_content
    end
  end

  test "report is owner only and excludes old visits" do
    Platform::PageVisit.create!(event_id: SecureRandom.uuid, visitor_id: SecureRandom.uuid, path: "/demo", created_at: 31.days.ago)
    get "/api/owner/command_center"
    assert_response :unauthorized
    user = User.create!(email_address: "traffic-test@example.invalid", password: "Website-traffic-2026!", active: true)
    post "/api/session", params: { email_address: user.email_address, password: "Website-traffic-2026!" }, headers: csrf_headers, as: :json
    assert_response :success
    get "/api/owner/command_center"
    assert_response :forbidden
    user.update!(platform_owner: true, admin: true)
    get "/api/owner/command_center"
    assert_response :success
    assert_equal 0, response.parsed_body.dig("website_traffic", "views")
    assert_equal 30, response.parsed_body.dig("website_traffic", "daily").length
  end

  private

  def csrf_headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://localhost:3000" }
  end
end
