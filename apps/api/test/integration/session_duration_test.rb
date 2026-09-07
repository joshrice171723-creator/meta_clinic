require "test_helper"

class SessionDurationTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    @password = SecureRandom.hex(20)
    @user = User.create!(email_address: "session-duration@example.invalid", password: @password)
  end

  def sign_in
    get "/api/csrf"
    post "/api/session", params: { email_address: @user.email_address, password: @password },
      headers: { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  test "recent trusted activity cannot extend the twelve-hour server authority" do
    travel_to Time.utc(2026, 8, 31, 8) do
      sign_in
      record = @user.member_sessions.sole
      deadline = Time.current + 12.hours
      assert_equal deadline, record.expires_at
      assert_equal deadline, Time.httpdate(response.headers["Set-Cookie"].to_s[/expires=([^;]+)/i, 1])

      travel 12.hours - 1.second
      # Represent prior activity without sending hundreds of heartbeat requests.
      record.update!(last_activity_at: Time.current)
      patch "/api/session", headers: csrf_headers, as: :json
      assert_response :success
      assert_equal deadline, record.reload.expires_at
      assert_equal Time.current, record.last_activity_at

      # Activity immediately before the absolute deadline refreshes idle time only.
      travel 1.second
      get "/api/session"
      assert_response :unauthorized
      get "/api/materials"
      assert_response :unauthorized
    end
  end

  test "session polling does not extend idle expiry" do
    travel_to Time.utc(2026, 8, 31, 8) do
      sign_in
      record = @user.member_sessions.sole
      initial_activity_at = record.last_activity_at

      travel 14.minutes
      get "/api/session"
      assert_response :success
      assert_equal initial_activity_at, record.reload.last_activity_at

      travel 1.minute + 1.second
      get "/api/session"
      assert_response :unauthorized
    end
  end

  test "trusted browser activity extends an active session's idle expiry" do
    travel_to Time.utc(2026, 8, 31, 8) do
      sign_in
      record = @user.member_sessions.sole

      travel 14.minutes
      patch "/api/session", headers: csrf_headers, as: :json
      assert_response :success
      assert_equal Time.current, record.reload.last_activity_at
      assert_equal record.idle_expires_at.iso8601(6), response.parsed_body.dig("session_policy", "idle_expires_at")

      travel 14.minutes + 59.seconds
      get "/api/session"
      assert_response :success
    end
  end

  test "an expired session cannot be renewed by trusted browser activity" do
    sign_in
    record = @user.member_sessions.sole
    record.update!(last_activity_at: 15.minutes.ago - 1.second)

    patch "/api/session", headers: csrf_headers, as: :json
    assert_response :unauthorized
    assert_not MemberSession.exists?(record.id)
  end

  test "legacy twenty-four-hour sessions stop at twelve hours from creation" do
    sign_in
    @user.member_sessions.sole.update!(created_at: 13.hours.ago, expires_at: 11.hours.from_now)
    get "/api/session"
    assert_response :unauthorized
  end

  test "earlier explicit expiry still wins over the maximum duration" do
    sign_in
    @user.member_sessions.sole.update!(expires_at: 1.second.ago)
    get "/api/session"
    assert_response :unauthorized
  end
end
