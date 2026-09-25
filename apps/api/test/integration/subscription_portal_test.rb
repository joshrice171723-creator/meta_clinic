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
    @membership = @practice.memberships.create!(user: @admin)
    grant_permissions!(@membership, "subscription_catalog.read", "subscription_catalog.write", "subscription_catalog.publish", "billing.read", "billing.payment_record", "subscriptions.review", "facilities.write")
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
    patch "/api/clinic/subscription_catalog/family/#{family_id}", params: { item: { lock_version: 0, publish: true } }, headers: headers, as: :json
    assert_response :success
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

  test "catalog authored programs tiers and exact selections publish without leaking drafts or rewriting history" do
    sign_in(@admin)
    submit "/api/clinic/subscription_catalog/family", { item: { name: "Custom program", description: "Program copy from the clinic", display_order: 20 } }
    assert_response :success
    family = Clinic::Care::SubscriptionFamily.find(response.parsed_body.fetch("id"))
    options = 5.times.map do |index|
      submit "/api/clinic/subscription_catalog/service", { item: { name: "Catalog service #{index}", description: "Service description #{index}" } }
      assert_response :success
      response.parsed_body.fetch("id")
    end
    draft = { amount: "12.30", duration: 3, duration_unit: "months", renewal: "manual", cancellation: "end_of_term",
      refund_policy: "manual_review", terms: "Exact clinic-authored terms.\nKeep this second line.", description: "A clinic-authored card", display_order: 20,
      components: [
        { service_id: options[0], mode: "included", quantity: 2, frequency: "month" },
        { service_id: options[1], mode: "choose_one", group: "One focus", price_adjustment: "0.10" },
        { service_id: options[2], mode: "optional", price_adjustment: "0.20" },
        { service_id: options[3], mode: "choose_many", group: "Additional focus", min: 1, max: 2, price_adjustment: "0.03", eligibility_review: true },
        { service_id: options[4], mode: "choose_many", group: "Additional focus", min: 1, max: 2, price_adjustment: "0.07" }
      ] }
    tiers = [20, 10, 30].map do |order|
      submit "/api/clinic/subscription_catalog/package", { item: { name: "Tier #{order}", family_id: family.id, draft: draft.merge(display_order: order) } }
      assert_response :success
      package = Clinic::Care::SubscriptionPackage.find(response.parsed_body.fetch("id"))
      submit "/api/clinic/subscription_catalog/packages/#{package.id}/publish", { request_key: "publish-tier-#{order}", lock_version: package.lock_version }
      assert_response :success
      package.reload
    end
    sign_in(@user)
    get "/api/patient_portal/subscriptions", headers: @headers
    assert_empty response.parsed_body.fetch("catalog"), "A draft program must hide even published tiers"
    sign_in(@admin)
    patch "/api/clinic/subscription_catalog/family/#{family.id}", params: { item: { publish: true, lock_version: family.lock_version } }, headers: headers, as: :json
    assert_response :success
    sign_in(@user)
    get "/api/patient_portal/subscriptions", headers: @headers
    catalog = response.parsed_body.fetch("catalog")
    assert_equal ["Tier 10", "Tier 20", "Tier 30"], catalog.map { |row| row.fetch("terms").fetch("package_name") }
    assert_equal "Program copy from the clinic", catalog.first.fetch("program").fetch("description")
    assert_equal "A clinic-authored card", catalog.first.fetch("terms").fetch("description")
    assert_equal "Service description 0", catalog.first.fetch("terms").fetch("components").first.fetch("description")
    version_id = tiers.first.published_version_id
    submit "/api/patient_portal/subscriptions/quote", { version_id: version_id, selections: [options[1]] }
    assert_response :unprocessable_entity
    selections = options.values_at(1, 2, 3)
    submit "/api/patient_portal/subscriptions/quote", { version_id: version_id, selections: selections }
    assert_response :success
    assert_equal "12.63", response.parsed_body.fetch("terms").fetch("total")
    assert_equal true, response.parsed_body.fetch("terms").fetch("eligibility_review")
    submit "/api/patient_portal/subscriptions/checkout", { version_id: version_id, selections: selections, request_key: "snapshot-checkout" }
    assert_response :created
    agreement = Clinic::Care::SubscriptionAgreement.find(response.parsed_body.fetch("id"))
    original_terms = agreement.snapshot.deep_dup
    original_invoice = agreement.invoice.lines.pluck(:posted_amount)
    sign_in(@admin)
    patch "/api/clinic/subscription_catalog/family/#{family.id}", params: { item: { name: "Unpublished rename", description: "Unpublished program copy", display_order: 1, lock_version: family.reload.lock_version } }, headers: headers, as: :json
    assert_response :success
    tier = tiers.first
    patch "/api/clinic/subscription_catalog/package/#{tier.id}", params: { item: { name: "New tier name", draft: draft.merge(amount: "99.99", terms: "Replacement terms"), lock_version: tier.lock_version } }, headers: headers, as: :json
    assert_response :success
    sign_in(@user)
    get "/api/patient_portal/subscriptions", headers: @headers
    assert_equal catalog, response.parsed_body.fetch("catalog"), "Saved drafts must leave the entire storefront unchanged"
    sign_in(@admin)
    patch "/api/clinic/subscription_catalog/family/#{family.id}", params: { item: { publish: true, lock_version: family.reload.lock_version } }, headers: headers, as: :json
    assert_response :success
    submit "/api/clinic/subscription_catalog/packages/#{tier.id}/publish", { request_key: "republish-tier", lock_version: tier.reload.lock_version }
    assert_response :success
    sign_in(@user)
    get "/api/patient_portal/subscriptions", headers: @headers
    updated = response.parsed_body.fetch("catalog")
    assert_equal "Unpublished rename", updated.first.fetch("program").fetch("name")
    assert_equal "Unpublished program copy", updated.first.fetch("program").fetch("description")
    assert_equal "99.99", updated.find { |row| row.fetch("terms").fetch("package_name") == "New tier name" }.fetch("terms").fetch("amount")
    assert_equal original_terms, agreement.reload.snapshot
    assert_equal original_invoice, agreement.invoice.lines.pluck(:posted_amount)
    assert_equal "Tier 20", Clinic::Care::SubscriptionVersion.find(version_id).snapshot.fetch("package_name")
    submit "/api/patient_portal/subscriptions/quote", { version_id: version_id, selections: selections }
    assert_response :unprocessable_entity
  end

  test "clinic type selects an idempotent unpublished membership starter" do
    Clinic::Configuration::PracticeFeatures.revise(practice: @practice, actor: @membership,
      request_key: "weight-loss-membership-profile", expected_revision: 0, insurance_workflows_enabled: false,
      clinic_type: "weight_loss", service_scope: [], assessment_scope: [])
    sign_in(@admin)
    get "/api/clinic/subscription_catalog", headers: headers
    assert_response :success
    assert_equal "weight_loss", response.parsed_body.fetch("clinic_type")

    2.times do |attempt|
      post "/api/clinic/subscription_catalog/template", headers: headers, as: :json
      assert_response :success
      assert_equal "weight_loss", response.parsed_body.fetch("clinic_type")
      assert_equal 3, response.parsed_body.fetch("created_count") if attempt.zero?
      assert_equal 0, response.parsed_body.fetch("created_count") if attempt == 1
    end

    family = Clinic::Care::SubscriptionFamily.find_by!(practice: @practice, name: "Weight management")
    assert_nil family.published_snapshot
    assert_equal ["Weight-management follow-up", "Weight-management initial visit"],
      Clinic::Care::ServiceOption.where(practice: @practice).order(:name).pluck(:name)
    assert_equal 0, Clinic::Care::SubscriptionPackage.where(practice: @practice).count
  end

  test "membership starter rejects a clinic type without a matching template" do
    sign_in(@admin)
    post "/api/clinic/subscription_catalog/template", headers: headers, as: :json
    assert_response :unprocessable_entity
    assert_equal "No membership starter is available for the selected clinic type.", response.parsed_body.fetch("error")
    assert_equal 0, Clinic::Care::SubscriptionFamily.where(practice: @practice).count
  end

  test "unpublished program moves do not change availability and retirement denies quote and checkout" do
    version_id = publish_catalog
    package = Clinic::Care::SubscriptionVersion.find(version_id).package
    other = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Draft destination", retired: true)
    # An already saved draft may point to a program retired later.
    package.update!(family_id: other.id)
    sign_in(@user)
    get "/api/patient_portal/subscriptions", headers: @headers
    assert_equal [version_id], response.parsed_body.fetch("catalog").map { |row| row.fetch("id") }
    submit "/api/patient_portal/subscriptions/quote", { version_id: version_id, selections: [] }
    assert_response :success
    original_family = Clinic::Care::SubscriptionFamily.find(package.published_version.snapshot.fetch("family_id"))
    original_family.update!(retired: true)
    get "/api/patient_portal/subscriptions", headers: @headers
    assert_empty response.parsed_body.fetch("catalog")
    submit "/api/patient_portal/subscriptions/quote", { version_id: version_id, selections: [] }
    assert_response :unprocessable_entity
    submit "/api/patient_portal/subscriptions/checkout", { version_id: version_id, selections: [], request_key: "retired-program" }
    assert_response :unprocessable_entity
  end
end
