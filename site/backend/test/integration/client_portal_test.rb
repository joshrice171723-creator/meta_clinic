require "test_helper"

class ClientPortalTest < ActionDispatch::IntegrationTest
  PASSWORD = "Synthetic-portal-password!".freeze
  setup do
    Rails.cache.clear
    @user = User.create!(email_address: "portal@example.invalid", password: PASSWORD)
    @other = User.create!(email_address: "other@example.invalid", password: PASSWORD)
    @document = Paperwork.assign_demo!(@user)
    @other_document = Paperwork.assign_demo!(@other)
    @material = Material.create!(title: "Synthetic lesson", body: "Synthetic learning content", published_at: Time.current)
  end

  def csrf
    get "/api/csrf"
    { "X-CSRF-Token" => response.parsed_body.fetch("csrf_token"), "Origin" => "http://www.example.com" }
  end

  def sign_in(user = @user)
    post "/api/session", params: { email_address: user.email_address, password: PASSWORD }, headers: csrf, as: :json
    assert_response :success
  end

  def sign(document = @document, **overrides)
    post "/api/paperworks/#{document.id}/sign", params: {
      signature_name: "Alex Example", password: PASSWORD, consent: true, content_digest: document.content_digest
    }.merge(overrides), headers: csrf, as: :json
  end

  test "all paperwork endpoints require authentication" do
    get "/api/paperworks"
    assert_response :unauthorized
    get "/api/paperworks/#{@document.id}"
    assert_response :unauthorized
    post "/api/paperworks/#{@document.id}/start", headers: csrf, as: :json
    assert_response :unauthorized
  end

  test "client cannot list, read, start or sign another client's paperwork" do
    sign_in
    get "/api/paperworks"
    assert_equal [ @document.id ], response.parsed_body["paperworks"].pluck("id")
    get "/api/paperworks/#{@other_document.id}"
    assert_response :not_found
    post "/api/paperworks/#{@other_document.id}/start", headers: csrf, as: :json
    assert_response :not_found
    sign(@other_document)
    assert_response :not_found
    assert_nil @other_document.reload.started_at
  end

  test "review and signing progress persists with versioned encrypted evidence" do
    sign_in
    get "/api/paperworks/#{@document.id}"
    assert_equal "not_started", response.parsed_body["paperwork"]["status"]
    assert_nil @document.reload.started_at
    post "/api/paperworks/#{@document.id}/start", headers: csrf, as: :json
    assert_response :success
    assert_equal "started", response.parsed_body["paperwork"]["status"]
    sign
    assert_response :success
    assert_equal "completed", response.parsed_body["paperwork"]["status"]
    record = @document.reload
    assert_equal "Alex Example", record.signature_name
    assert_equal Paperwork::CONSENT_VERSION, record.consent_version
    assert_equal 64, record.signature_digest.length
    raw = Paperwork.connection.select_one("SELECT body, signature_name FROM paperworks WHERE id = #{record.id}")
    assert_not_includes raw["body"], "DEMONSTRATION"
    assert_not_includes raw["signature_name"], "Alex Example"
    get "/api/paperworks"
    assert_equal "completed", response.parsed_body["paperworks"].first["status"]
  end

  test "signing requires started review, consent, password and matching document digest" do
    sign_in
    sign
    assert_response :conflict
    post "/api/paperworks/#{@document.id}/start", headers: csrf, as: :json
    sign(consent: false)
    assert_response :unprocessable_entity
    sign(consent: "true")
    assert_response :unprocessable_entity
    sign(password: "wrong")
    assert_response :unauthorized
    sign(content_digest: "old-version")
    assert_response :conflict
    sign(signature_name: " ")
    assert_response :conflict
    assert_nil @document.reload.signed_at
  end

  test "real documents cannot be signed in this prototype" do
    document = @user.paperworks.create!(title: "Unreviewed example", body: "Synthetic non-demo test", document_version: "test-v1", demo: false)
    sign_in
    post "/api/paperworks/#{document.id}/start", headers: csrf, as: :json
    sign(document)
    assert_response :conflict
    assert_nil document.reload.signed_at
  end

  test "completed signature cannot be replaced and assigned contents are immutable" do
    sign_in
    post "/api/paperworks/#{@document.id}/start", headers: csrf, as: :json
    sign
    assert_response :success
    evidence = @document.reload.signature_digest
    sign(signature_name: "Different Example")
    assert_response :conflict
    assert_equal evidence, @document.reload.signature_digest
    assert_not @document.update(body: "Changed content")
    assert_not @document.reload.update(signature_name: "Overwritten")
    assert_not @document.reload.destroy
  end

  test "lesson progress is individual and completion is idempotent" do
    sign_in
    post "/api/materials/#{@material.id}/complete", headers: csrf, as: :json
    assert_response :not_found
    2.times do
      post "/api/materials/#{@material.id}/start", headers: csrf, as: :json
      assert_response :success
    end
    assert_equal 1, @user.learning_progresses.count
    2.times do
      post "/api/materials/#{@material.id}/complete", headers: csrf, as: :json
      assert_response :success
      assert_equal "completed", response.parsed_body["status"]
    end
    get "/api/materials/#{@material.id}"
    assert_equal "completed", response.parsed_body["material"]["status"]
    sign_in(@other)
    get "/api/materials/#{@material.id}"
    assert_equal "not_started", response.parsed_body["material"]["status"]
    draft = Material.create!(title: "Draft example", body: "Unpublished")
    post "/api/materials/#{draft.id}/start", headers: csrf, as: :json
    assert_response :not_found
  end

  test "paperwork mutation rejects missing CSRF" do
    sign_in
    post "/api/paperworks/#{@document.id}/start", as: :json
    assert_response :unprocessable_entity
    assert_nil @document.reload.started_at
  end
end
