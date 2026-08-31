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

  test "session and cookie start at twelve hours and activity cannot extend server authority" do
    travel_to Time.utc(2026, 8, 31, 8) do
      sign_in
      record = @user.member_sessions.sole
      deadline = Time.current + 12.hours
      assert_equal deadline, record.expires_at
      assert_equal deadline, Time.httpdate(response.headers["Set-Cookie"].to_s[/expires=([^;]+)/i, 1])
      travel 12.hours - 1.second
      get "/api/session"
      assert_response :success
      assert_equal deadline, record.reload.expires_at
      # A freshly refreshed browser cookie still cannot extend the database session.
      travel 1.second
      get "/api/session"
      assert_response :unauthorized
      get "/api/materials"
      assert_response :unauthorized
    end
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
