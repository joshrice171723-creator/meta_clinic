require "test_helper"

class MemberFlowsTest < ActionDispatch::IntegrationTest
  PASSWORD = "Synthetic-test-only-2026!".freeze

  setup do
    Rails.cache.clear
    @user = User.create!(email_address: "member@example.invalid", password: PASSWORD)
  end

  def csrf_headers
    get "/api/csrf"
    assert_response :success
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  def sign_in(user = @user)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "anonymous visitors cannot access materials or inbox" do
    get "/api/materials"
    assert_response :unauthorized
    get "/api/inquiries"
    assert_response :unauthorized
    assert_equal "no-store", response.headers["Cache-Control"]
  end

  test "CSRF and origin protection are enforced" do
    post "/api/session", params: { email_address: @user.email_address, password: PASSWORD }, as: :json
    assert_response :unprocessable_entity
    post "/api/session", params: { email_address: @user.email_address, password: PASSWORD },
      headers: csrf_headers.merge("Origin" => "https://untrusted.example"), as: :json
    assert_response :unprocessable_entity
    assert_equal 0, MemberSession.count
  end

  test "login normalizes email and cookie is HttpOnly SameSite Lax" do
    post "/api/session", params: { email_address: " MEMBER@EXAMPLE.INVALID ", password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 1, MemberSession.count
    assert_match(/httponly/i, response.headers["Set-Cookie"].to_s)
    assert_match(/samesite=lax/i, response.headers["Set-Cookie"].to_s)
    get "/api/session"
    assert_equal @user.id, response.parsed_body.dig("user", "id")
    assert_not response.parsed_body["user"].key?("password_digest")
  end

  test "invalid and deactivated accounts receive the same generic failure" do
    post "/api/session", params: { email_address: @user.email_address, password: "incorrect" }, headers: csrf_headers, as: :json
    assert_response :unauthorized
    first_error = response.parsed_body
    @user.update!(active: false)
    post "/api/session", params: { email_address: @user.email_address, password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :unauthorized
    assert_equal first_error, response.parsed_body
  end

  test "sign out revokes the database session and replay of the previous cookie" do
    sign_in
    previous_cookie = cookies["_apply_session"]
    delete "/api/session", headers: csrf_headers, as: :json
    assert_response :no_content
    assert_equal 0, MemberSession.count
    cookies["_apply_session"] = previous_cookie
    get "/api/materials"
    assert_response :unauthorized
  end

  test "expired sessions and password changes remove access" do
    sign_in
    MemberSession.last.update!(expires_at: 1.minute.ago)
    get "/api/materials"
    assert_response :unauthorized
    sign_in
    @user.update!(password: "Another-synthetic-password!")
    get "/api/materials"
    assert_response :unauthorized
    assert_equal 0, @user.member_sessions.count
  end

  test "members see only published materials and cannot access administration" do
    ready = Launch::Material.create!(title: "Synthetic published example", body: "<script>Text only</script>", published_at: 1.minute.ago)
    draft = Launch::Material.create!(title: "Unpublished example", body: "Draft content")
    future = Launch::Material.create!(title: "Future example", body: "Scheduled content", published_at: 1.day.from_now)
    sign_in
    get "/api/materials"
    assert_response :success
    assert_equal [ ready.id ], response.parsed_body["materials"].pluck("id")
    assert_not response.parsed_body["materials"].first.key?("body")
    get "/api/materials/#{ready.id}"
    assert_response :success
    get "/api/materials/#{draft.id}"
    assert_response :not_found
    get "/api/materials/#{future.id}"
    assert_response :not_found
    get "/api/inquiries"
    assert_response :forbidden
  end

  test "contact submissions persist encrypted and are visible only to platform owners" do
    details = { name: "Synthetic Visitor", email: "visitor@example.invalid", message: "A wholly synthetic business inquiry.", website: "" }
    assert_difference "Launch::ContactMessage.count", 1 do
      post "/api/contact_messages", params: { contact_message: details }, headers: csrf_headers, as: :json
      assert_response :created
    end
    record = Launch::ContactMessage.last
    assert_equal details[:message], record.message
    raw = Launch::ContactMessage.connection.select_one("SELECT name, email, message FROM contact_messages WHERE id = #{record.id}")
    raw.each_value { |value| assert_not_includes value, "Synthetic" }
    assert_not_includes raw["email"], details[:email]
    assert_not_includes raw["message"], details[:message]
    @user.update!(admin: true, platform_owner: true)
    sign_in
    get "/api/inquiries"
    assert_response :success
    assert_equal details[:message], response.parsed_body["inquiries"].first["message"]
  end

  test "inquiry pagination includes older messages" do
    51.times { |n| Launch::ContactMessage.create!(name: "Synthetic #{n}", email: "visitor@example.invalid", message: "Synthetic pagination test.") }
    @user.update!(admin: true, platform_owner: true)
    sign_in
    get "/api/inquiries"
    assert_equal 50, response.parsed_body["inquiries"].length
    cursor = response.parsed_body["next_cursor"]
    get "/api/inquiries", params: { before: cursor }
    assert_equal 1, response.parsed_body["inquiries"].length
    assert_nil response.parsed_body["next_cursor"]
  end

  test "clinic administrators cannot access platform inquiries" do
    @user.update!(admin: true)
    sign_in
    get "/api/inquiries"
    assert_response :forbidden
  end

  test "invalid, spam and malformed contact submissions are not stored" do
    assert_no_difference "Launch::ContactMessage.count" do
      post "/api/contact_messages", params: { contact_message: { name: "", email: "bad", message: "short" } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      post "/api/contact_messages", params: { contact_message: { name: "Synthetic", email: "s@example.invalid", message: "Synthetic business request", website: "spam" } }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
      post "/api/contact_messages", params: { contact_message: "invalid shape" }, headers: csrf_headers, as: :json
      assert_response :bad_request
    end
  end

  test "repeated failed logins are throttled" do
    10.times do
      post "/api/session", params: { email_address: @user.email_address, password: "wrong" }, headers: csrf_headers, as: :json
      assert_response :unauthorized
    end
    post "/api/session", params: { email_address: @user.email_address, password: PASSWORD }, headers: csrf_headers, as: :json
    assert_response :too_many_requests
  end

  test "password length and normalized unique email are validated" do
    assert_not User.new(email_address: "new@example.invalid", password: "short").valid?
    assert_not User.new(email_address: " MEMBER@example.invalid ", password: PASSWORD).valid?
    assert_not User.new(email_address: "new@example.invalid", password: "é" * 40).valid?
  end
end
