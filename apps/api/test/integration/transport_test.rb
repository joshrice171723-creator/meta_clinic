require "test_helper"

class TransportTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "transport@example.invalid", password: @password)
  end

  def headers
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  test "backend owns no browser page routes and cannot create an account through navigation" do
    assert_no_difference [ "User.count", "MemberSession.count", "Clinic::Practice.count" ] do
      %w[/ /login /portal /contact /signup /clinic /clinic/demo].each do |path|
        get path
        assert_response :not_found
      end
      get "/api/session"
      assert_response :unauthorized
      get "/api/csrf"
      assert_response :success
    end
  end

  test "signed demonstration receipt is an authorized no-store attachment" do
    document = Launch::Paperwork.assign_demo!(@user)
    other = User.create!(email_address: "transport-other@example.invalid", password: @password)
    other_document = Launch::Paperwork.assign_demo!(other)
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: headers, as: :json
    assert_response :success
    get "/api/paperworks/#{other_document.id}/receipt"
    assert_response :not_found
    get "/api/paperworks/#{document.id}/receipt"
    assert_response :conflict
    post "/api/paperworks/#{document.id}/start", headers: headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.dig("paperwork", "signing_available")
    post "/api/paperworks/#{document.id}/sign", params: { consent: true, password: @password, signature_name: "Alex Example", content_digest: document.content_digest }, headers: headers, as: :json
    assert_response :success
    get "/api/paperworks/#{document.id}/receipt"
    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_includes response.headers["Content-Disposition"], "attachment"
    assert_includes response.body, "DEMONSTRATION ONLY"
    delete "/api/session", headers: headers, as: :json
    get "/api/paperworks/#{document.id}/receipt"
    assert_response :unauthorized
  end

  test "API determines signing eligibility and production navigation availability" do
    document = @user.paperworks.create!(title: "Synthetic unsigned reference", body: "Fictional only", document_version: "v1", demo: false)
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: headers, as: :json
    get "/api/paperworks/#{document.id}"
    assert_equal false, response.parsed_body.dig("paperwork", "signing_available")
    previous = Rails.env
    Rails.env = "production"
    get "/api/csrf"
    assert_equal false, response.parsed_body.fetch("clinic_available")
    assert_equal false, response.parsed_body.fetch("development_login")
  ensure
    Rails.env = previous if previous
  end
end
