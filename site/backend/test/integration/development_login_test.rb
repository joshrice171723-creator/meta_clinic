require "test_helper"

class DevelopmentLoginTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @origin = "http://localhost:3000"
    @sample = Material.create!(title: "Sample operations", body: "Synthetic lesson", sample: true, published_at: Time.current)
    @private_material = Material.create!(title: "Non-sample content", body: "Synthetic restricted test", sample: false, published_at: Time.current)
  end

  def with_environment(name = "development", flag: "1")
    previous = ENV["APP_DEVELOPMENT_LOGIN"]
    previous_environment = Rails.env
    ENV["APP_DEVELOPMENT_LOGIN"] = flag
    Rails.env = name
    yield
  ensure
    ENV["APP_DEVELOPMENT_LOGIN"] = previous
    Rails.env = previous_environment
  end

  def headers
    { "Origin" => @origin, "REMOTE_ADDR" => "127.0.0.1" }
  end

  def csrf
    get "/api/csrf", headers: headers
    headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def enter_demo
    post "/api/development_session", headers: csrf, as: :json
    assert_response :created
    get "/api/session", headers: headers
    assert_response :success
    assert_equal true, response.parsed_body.dig("user", "development_demo")
    User.find(response.parsed_body.dig("user", "id"))
  end

  test "disabled by default and in production even when explicitly flagged" do
    [ [ "development", nil ], [ "development", "0" ], [ "test", "1" ], [ "production", "1" ] ].each do |name, flag|
      with_environment(name, flag: flag) do
        token = csrf
        assert_equal false, response.parsed_body["development_login"]
        assert_no_difference "User.count" do
          post "/api/development_session", headers: token, as: :json
          assert_response :not_found
        end
      end
    end
  end

  test "requires CSRF and loopback host, origin and peer" do
    with_environment do
      post "/api/development_session", headers: headers, as: :json
      assert_response :unprocessable_entity
      post "/api/development_session", headers: csrf.merge("Origin" => "http://evil.example"), as: :json
      assert_response :unprocessable_entity
      post "/api/development_session", headers: csrf.merge("REMOTE_ADDR" => "203.0.113.20"), as: :json
      assert_response :not_found
      host! "www.example.com"
      @origin = "http://www.example.com"
      post "/api/development_session", headers: csrf, as: :json
      assert_response :not_found
    end
  end

  test "demo is isolated, non-admin, sample-only and can finish the walkthrough without a password" do
    with_environment do
      first = enter_demo
      assert_not first.admin?
      document = first.paperworks.sole
      assert document.demo?
      get "/api/inquiries", headers: headers
      assert_response :forbidden
      get "/api/materials", headers: headers
      assert_equal [ @sample.id ], response.parsed_body["materials"].pluck("id")
      get "/api/materials/#{@private_material.id}", headers: headers
      assert_response :not_found
      post "/api/materials/#{@private_material.id}/start", headers: csrf, as: :json
      assert_response :not_found
      post "/api/materials/#{@sample.id}/start", headers: csrf, as: :json
      assert_response :success
      post "/api/materials/#{@sample.id}/complete", headers: csrf, as: :json
      assert_equal "completed", response.parsed_body["status"]
      post "/api/paperworks/#{document.id}/start", headers: csrf, as: :json
      assert_response :success
      payload = { consent: true, signature_name: "Alex Example", content_digest: document.content_digest }
      post "/api/paperworks/#{document.id}/sign", params: payload.merge(consent: false), headers: csrf, as: :json
      assert_response :unprocessable_entity
      post "/api/paperworks/#{document.id}/sign", params: payload.merge(content_digest: "stale"), headers: csrf, as: :json
      assert_response :conflict
      post "/api/paperworks/#{document.id}/sign", params: payload, headers: csrf, as: :json
      assert_response :success
      assert_equal "completed", document.reload.status
      second = enter_demo
      assert_not_equal first.id, second.id
      get "/api/paperworks/#{document.id}", headers: headers
      assert_response :not_found
      assert_equal "not_started", second.paperworks.sole.status
    end
  end

  test "existing demo sessions stop working after flag removal or outside development" do
    with_environment { enter_demo }
    [ [ "development", nil ], [ "production", "1" ] ].each do |name, flag|
      with_environment(name, flag: flag) do
        get "/api/session", headers: headers
        assert_response :unauthorized
      end
    end
  end

  test "demo mode cannot sign non-demo documents or elevate to administrator" do
    with_environment do
      user = enter_demo
      document = user.paperworks.create!(title: "Restricted test", body: "Synthetic non-demo", document_version: "test-v1", demo: false)
      post "/api/paperworks/#{document.id}/start", headers: csrf, as: :json
      post "/api/paperworks/#{document.id}/sign", params: { consent: true, signature_name: "Alex Example", content_digest: document.content_digest }, headers: csrf, as: :json
      assert_response :unauthorized
      assert_nil document.reload.signed_at
      user.update!(admin: true)
      get "/api/session", headers: headers
      assert_response :unauthorized
    end
  end

  test "normal login cannot request the development signing shortcut" do
    with_environment do
      password = SecureRandom.hex(20)
      user = User.create!(email_address: "normal@example.invalid", password: password)
      document = Paperwork.assign_demo!(user)
      post "/api/session", params: { email_address: user.email_address, password: password, development_demo: true }, headers: csrf, as: :json
      assert_response :success
      get "/api/session", headers: headers
      assert_equal false, response.parsed_body.dig("user", "development_demo")
      post "/api/paperworks/#{document.id}/start", headers: csrf, as: :json
      post "/api/paperworks/#{document.id}/sign", params: { consent: true, signature_name: "Alex Example", content_digest: document.content_digest, development_demo: true }, headers: csrf, as: :json
      assert_response :unauthorized
    end
  end
end
