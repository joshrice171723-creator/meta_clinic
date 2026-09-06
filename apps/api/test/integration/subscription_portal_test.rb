require "test_helper"

class SubscriptionPortalTest < ActionDispatch::IntegrationTest
  setup do
    @previous_environment, @previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @admin = User.create!(email_address: "subscription-staff@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Dev Seed HTTP Clinic")
    membership = @practice.memberships.create!(user: @admin)
    grant_permissions!(membership, "subscription_catalog.read", "subscription_catalog.write", "subscription_catalog.publish", "billing.read", "billing.payment_record", "subscriptions.review")
    @patient = @practice.patients.create!(display_name: "Dev Seed HTTP Patient", reference: "HTTP-SUB-1")
    @user = User.create!(email_address: "synthetic-patient@example.invalid", password: Development::TestAccounts.send(:password_for, "patient"))
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: @user, status: "active", invited_at: Time.current, activated_at: Time.current)
    @foreign_practice = Clinic::Practice.create!(name: "Other Dev Seed HTTP Clinic")
  end

  teardown do
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = @previous_environment, @previous_flag
  end

  def headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def sign_in(user)
    if user == @user
      post "/api/development_session", params: { profile: "patient" }, headers: headers, as: :json
    else
      post "/api/session", params: { email_address: user.email_address, password: @password }, headers: headers, as: :json
    end
    assert_response :success
  end

  def submit(path, params)
    post path, params: params, headers: headers, as: :json
  end

  def publish_catalog
    sign_in(@admin)
    submit "/api/clinic/subscription_catalog/family", { item: { name: "Any custom family" } }
    assert_response :success
    family_id = response.parsed_body.fetch("id")
    submit "/api/clinic/subscription_catalog/service", { item: { name: "Any reusable option" } }
    assert_response :success
    service_id = response.parsed_body.fetch("id")
    submit "/api/clinic/subscription_catalog/package", { item: { name: "Any package", family_id: family_id,
      draft: { amount: "75.25", currency: "USD", duration: 3, duration_unit: "months", terms: "Fixed term, no automatic renewal.",
        components: [{ service_id: service_id, mode: "included" }] } } }
    assert_response :success
    package_id = response.parsed_body.fetch("id")
    submit "/api/clinic/subscription_catalog/packages/#{package_id}/publish", { request_key: "http-publish", lock_version: 0 }
    assert_response :success
    response.parsed_body.fetch("id")
  end

  test "admin publish patient purchase fixture reconciliation and ledger agree through HTTP" do
    version_id = publish_catalog
    sign_in(@user)
    get "/api/patient_portal/subscriptions", headers: @headers
    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_equal [version_id], response.parsed_body.fetch("catalog").map { |item| item.fetch("id") }
    submit "/api/patient_portal/subscriptions/checkout", { version_id: version_id, selections: [], request_key: "http-checkout", amount: "0.01" }
    assert_response :unprocessable_entity
    assert_equal 0, @patient.invoices.count
    submit "/api/patient_portal/subscriptions/checkout", { version_id: version_id, selections: [], request_key: "http-checkout" }
    assert_response :created
    agreement_id = response.parsed_body.fetch("id")
    assert_equal "75.25", response.parsed_body.fetch("amount")
    submit "/api/patient_portal/subscriptions/#{agreement_id}/pay", { request_key: "http-payment" }
    assert_response :accepted
    get "/api/clinic/subscriptions", headers: @headers
    assert_response :forbidden
    sign_in(@admin)
    submit "/api/clinic/subscriptions/#{agreement_id}/reconcile", { outcome: "succeeded", request_key: "http-event" }
    assert_response :success
    assert_equal "active", response.parsed_body.fetch("state")
    get "/api/clinic/subscriptions", headers: @headers
    assert_equal "0.0", response.parsed_body.fetch("subscriptions").first.fetch("balance")
    get "/api/clinic/subscriptions", params: { state: "active", search: "custom family" }, headers: @headers
    assert_response :success
    assert_equal [agreement_id], response.parsed_body.fetch("subscriptions").map { |item| item.fetch("id") }
    get "/api/clinic/subscriptions", params: { state: "payment_failed" }, headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("subscriptions")
    sign_in(@user)
    get "/api/patient_portal/context", headers: @headers
    assert_response :success
    assert_equal "0.0", response.parsed_body.fetch("balances").first.fetch("balance_amount")
    assert_equal "75.25", response.parsed_body.fetch("billing").fetch("payments").first.fetch("amount")
    get "/api/patient_portal/subscriptions/#{agreement_id}/receipt", headers: @headers
    assert_response :success
    assert_equal 1, response.parsed_body.fetch("receipts").length
    @identity.update!(status: "revoked", revoked_at: Time.current)
    get "/api/patient_portal/subscriptions", headers: @headers
    assert_response :forbidden
  end

  test "cross practice catalog references cannot be saved and publisher is separately authorized" do
    sign_in(@admin)
    foreign_family = Clinic::Care::SubscriptionFamily.create!(practice: @foreign_practice, name: "Foreign family")
    submit "/api/clinic/subscription_catalog/package", { item: { name: "Wrong family", family_id: foreign_family.id, draft: {} } }
    assert_response :not_found
    assert_equal 0, Clinic::Care::SubscriptionPackage.where(practice: @practice).count
    version_id = publish_catalog
    sign_in(@user)
    submit "/api/clinic/subscription_catalog/packages/#{Clinic::Care::SubscriptionVersion.find(version_id).package_id}/publish", { request_key: "unauthorized", lock_version: 1 }
    assert_response :forbidden
    get "/api/patient_portal/subscriptions/999999/receipt", headers: @headers
    assert_response :not_found
  end

  test "another patient in the same practice cannot read a receipt or pay the purchase" do
    version_id = publish_catalog
    sign_in(@user)
    submit "/api/patient_portal/subscriptions/checkout", { version_id: version_id, selections: [], request_key: "owned-purchase" }
    assert_response :created
    agreement_id = response.parsed_body.fetch("id")
    other_patient = @practice.patients.create!(display_name: "Other dev seed patient", reference: "HTTP-SUB-2")
    @identity.update!(patient: other_patient)
    get "/api/patient_portal/subscriptions/#{agreement_id}/receipt", headers: @headers
    assert_response :not_found
    submit "/api/patient_portal/subscriptions/#{agreement_id}/pay", { request_key: "wrong-patient" }
    assert_response :not_found
    get "/api/patient_portal/subscriptions", headers: @headers
    assert_empty response.parsed_body.fetch("subscriptions")
  end
end
