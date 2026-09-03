require "test_helper"

class SettingsTest < ActionDispatch::IntegrationTest
  PASSWORD = "Synthetic-settings-only-2026!".freeze

  setup do
    Rails.cache.clear
    @user = User.create!(email_address: "settings-one@example.invalid", password: PASSWORD)
    @other = User.create!(email_address: "settings-two@example.invalid", password: PASSWORD)
  end

  def headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  def sign_in(user = @user)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD }, headers: headers, as: :json
    assert_response :success
  end

  def save_appearance(palette: "cobalt", mode: "dark", version: 0, expected_user_id: @user.id, **extra)
    patch "/api/settings", params: { expected_user_id: expected_user_id, appearance: { palette: palette, mode: mode, version: version }, **extra }, headers: headers, as: :json
  end

  test "anonymous reads and writes are rejected and responses are not cached" do
    get "/api/settings"
    assert_response :unauthorized
    assert_equal "no-store", response.headers["Cache-Control"]
    save_appearance
    assert_response :unauthorized
    assert_equal 0, Identity::Preference.count
  end

  test "read supplies defaults without creating a row and save survives a new session" do
    sign_in
    assert_no_difference "Identity::Preference.count" do
      get "/api/settings"
      assert_response :success
    end
    assert_equal({ "palette" => "juniper", "mode" => "system", "version" => 0 }, response.parsed_body["appearance"])
    assert_equal @user.id, response.parsed_body["user_id"]
    save_appearance
    assert_response :success
    assert_equal 1, response.parsed_body.dig("appearance", "version")
    delete "/api/session", headers: headers, as: :json
    sign_in
    get "/api/settings"
    assert_equal "cobalt", response.parsed_body.dig("appearance", "palette")
    assert_equal "dark", response.parsed_body.dig("appearance", "mode")
    assert_equal %w[appearance user_id], response.parsed_body.keys.sort
  end

  test "accounts are isolated and client supplied target IDs cannot redirect writes" do
    sign_in
    save_appearance(user_id: @other.id, admin: true)
    assert_response :success
    assert_nil Identity::Preference.find_by(user: @other)
    assert_not @user.reload.admin?
    sign_in(@other)
    get "/api/settings"
    assert_equal "juniper", response.parsed_body.dig("appearance", "palette")
    save_appearance(expected_user_id: @user.id)
    assert_response :conflict
    assert_nil Identity::Preference.find_by(user: @other)
    save_appearance(expected_user_id: @other.id, palette: "plum")
    assert_response :success
    assert_equal "cobalt", Identity::Preference.find_by!(user: @user).palette
    assert_equal "plum", Identity::Preference.find_by!(user: @other).palette
  end

  test "stale and repeated saves cannot silently overwrite newer settings" do
    sign_in
    save_appearance
    assert_response :success
    save_appearance(palette: "plum")
    assert_response :conflict
    assert_match(/Reload saved settings/, response.parsed_body["error"])
    save_appearance(palette: "plum", version: 1)
    assert_response :success
    assert_equal 2, response.parsed_body.dig("appearance", "version")
    assert_equal 1, Identity::Preference.where(user: @user).count
  end

  test "invalid enum and version values fail without partial changes" do
    sign_in
    [ { palette: "external" }, { mode: "invalid" }, { version: -1 }, { version: "0oops" }, { version: nil } ].each do |invalid|
      save_appearance(**invalid)
      assert_response :unprocessable_entity
      assert_equal 0, Identity::Preference.count
    end
    patch "/api/settings", params: { expected_user_id: @user.id, appearance: "bad shape" }, headers: headers, as: :json
    assert_response :bad_request
    %w[juniper cobalt plum saffron].product(%w[system light dark]).each_with_index do |(palette, mode), revision|
      save_appearance(palette: palette, mode: mode, version: revision)
      assert_response :success
    end
  end

  test "CSRF origin session expiry and revoked account guards remain enforced" do
    sign_in
    payload = { expected_user_id: @user.id, appearance: { palette: "cobalt", mode: "light", version: 0 } }
    patch "/api/settings", params: payload, as: :json
    assert_response :unprocessable_entity
    patch "/api/settings", params: payload, headers: headers.merge("Origin" => "https://other.example.invalid"), as: :json
    assert_response :unprocessable_entity
    MemberSession.last.update!(expires_at: 1.minute.ago)
    save_appearance
    assert_response :unauthorized
    sign_in
    @user.update!(active: false)
    save_appearance
    assert_response :unauthorized
    assert_equal 0, Identity::Preference.count
  end

  test "database constraints reject unsupported preferences and duplicate owners" do
    record = Identity::Preference.create!(user: @user)
    assert_raises(ActiveRecord::StatementInvalid) do
      Identity::Preference.transaction(requires_new: true) { record.update_column(:palette, "invalid") }
    end
    assert_raises(ActiveRecord::RecordNotUnique) do
      Identity::Preference.transaction(requires_new: true) { Identity::Preference.create!(user: @user) }
    end
    assert_equal "juniper", record.reload.palette
  end
end
