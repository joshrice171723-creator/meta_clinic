require "test_helper"
require "uri"

class MembershipGrowthTest < ActionDispatch::IntegrationTest
  class Gateway
    attr_reader :session, :calls

    def initialize(amount_cents: 7925)
      @amount_cents = amount_cents
      @application_fee_cents = 166
      @calls = []
    end

    def tamper_application_fee
      @application_fee_cents = 1
    end

    def mark_paid
      @session.merge!("status" => "complete", "payment_status" => "paid")
      if @session["mode"] == "subscription"
        @session["subscription"] = "sub_storefrontpaid"
      else
        @session["payment_intent"] = "pi_storefrontpaid"
      end
    end

    def request(method, path, **options)
      @calls << [ method, path, options ]
      value = case [ method, path ]
      when [ :get, "/v2/core/accounts/acct_storefront" ]
        {
          "id" => "acct_storefront", "livemode" => false, "dashboard" => "full",
          "metadata" => { "apply_connection" => "storefront-connection" },
          "defaults" => { "responsibilities" => { "fees_collector" => "stripe", "losses_collector" => "stripe" } },
          "configuration" => { "merchant" => { "capabilities" => {
            "card_payments" => { "status" => "active" }, "stripe_balance" => { "payouts" => { "status" => "active" } }
          } } }
        }
      when [ :post, "/v1/checkout/sessions" ]
        fields = options.fetch(:fields)
        reference = fields.fetch("metadata[apply_membership_prospect]")
        @reference = reference
        @session = {
          "id" => "cs_test_storefront", "livemode" => false, "mode" => fields.fetch("mode"),
          "status" => "open", "payment_status" => "unpaid", "payment_intent" => nil,
          "amount_total" => @amount_cents, "currency" => "usd",
          "metadata" => { "apply_membership_prospect" => reference, "apply_collection_intent" => reference },
          "url" => "https://checkout.stripe.com/c/pay/storefront"
        }
      when [ :get, "/v1/checkout/sessions/cs_test_storefront" ]
        @session
      when [ :get, "/v1/subscriptions/sub_storefrontpaid" ]
        {
          "id" => "sub_storefrontpaid", "livemode" => false,
          "metadata" => { "apply_collection_intent" => @reference }, "application_fee_percent" => "2.1",
          "items" => { "data" => [{ "quantity" => 1, "price" => { "unit_amount" => @amount_cents,
            "currency" => "usd", "recurring" => { "interval" => "month", "interval_count" => 1 } } }], "has_more" => false },
          "collection_method" => "charge_automatically", "trial_end" => nil, "pause_collection" => nil,
          "discounts" => [], "status" => "active", "latest_invoice" => "in_storefrontpaid",
          "cancel_at_period_end" => false
        }
      when [ :get, "/v1/invoices/in_storefrontpaid" ]
        paid_at = Time.utc(2026, 9, 12, 18).to_i
        {
          "id" => "in_storefrontpaid", "livemode" => false,
          "parent" => { "subscription_details" => { "subscription" => "sub_storefrontpaid" } },
          "currency" => "usd", "status" => "paid", "amount_paid" => @amount_cents,
          "total" => @amount_cents, "amount_remaining" => 0, "billing_reason" => "subscription_create",
          "status_transitions" => { "paid_at" => paid_at },
          "lines" => { "data" => [{ "amount" => @amount_cents,
            "parent" => { "subscription_item_details" => { "proration" => false,
              "subscription" => "sub_storefrontpaid" } },
            "period" => { "start" => paid_at, "end" => 1.month.from_now.to_i } }], "has_more" => false }
        }
      when [ :get, "/v1/invoice_payments" ]
        { "data" => [{ "amount_paid" => @amount_cents,
          "payment" => { "payment_intent" => "pi_storefrontpaid" } }], "has_more" => false }
      when [ :get, "/v1/payment_intents/pi_storefrontpaid" ]
        {
          "id" => "pi_storefrontpaid", "livemode" => false, "status" => "succeeded",
          "amount_received" => @amount_cents, "amount" => @amount_cents, "currency" => "usd",
          "application_fee_amount" => @application_fee_cents, "latest_charge" => "ch_storefrontpaid",
          "metadata" => { "apply_collection_intent" => @session.dig("metadata", "apply_collection_intent") }
        }
      when [ :get, "/v1/charges/ch_storefrontpaid" ]
        {
          "id" => "ch_storefrontpaid", "livemode" => false, "payment_intent" => "pi_storefrontpaid",
          "status" => "succeeded", "paid" => true, "created" => Time.utc(2026, 9, 12, 18).to_i,
          "currency" => "usd", "amount" => @amount_cents, "amount_refunded" => 0
        }
      else
        raise "Unexpected Stripe request: #{method} #{path}"
      end
      value.deep_dup
    end
  end

  setup do
    @previous_environment, @previous_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    @saved_stripe = ENV.to_h.slice("STRIPE_SANDBOX_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_RETURN_ORIGIN")
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    ENV["STRIPE_SANDBOX_KEY"] = "rk_test_storefrontfixture"
    ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_storefront_fixture"
    ENV["STRIPE_RETURN_ORIGIN"] = "http://127.0.0.1:3200"
    Rails.cache.clear
    ActionMailer::Base.deliveries.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = "Synthetic-staff-password-2026!"
    @practice = Clinic::Practice.create!(name: "Dev Seed North Membership Clinic")
    @admin = create_staff(@practice, "growth-admin@example.invalid",
      "subscription_catalog.read", "subscription_catalog.write", "subscription_catalog.publish",
      "subscriptions.review", "patients.write", "patient_portal.identity.invite")
    @connection = Clinic::Billing::StripeConnection.create!(practice: @practice, connected_by: @admin,
      reference: "storefront-connection", account_id: "acct_storefront", charges_enabled: true, payouts_enabled: true)
    @foreign_practice = Clinic::Practice.create!(name: "Dev Seed South Membership Clinic")
    @foreign_admin = create_staff(@foreign_practice, "growth-foreign@example.invalid",
      "subscription_catalog.read", "subscription_catalog.write", "subscription_catalog.publish")
  end

  teardown do
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = @previous_environment, @previous_flag
    %w[STRIPE_SANDBOX_KEY STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_RETURN_ORIGIN].each do |key|
      @saved_stripe.key?(key) ? ENV[key] = @saved_stripe[key] : ENV.delete(key)
    end
  end

  test "clinic storefront keeps each catalog separate and captures a contact-first lead without a patient" do
    version_id = publish_catalog(@admin, "North")
    foreign_version_id = publish_catalog(@foreign_admin, "South")
    configure_storefront(@admin, "north-memberships", enabled: true)
    configure_storefront(@foreign_admin, "south-memberships", enabled: true)

    get "/api/public/membership_storefronts", headers: @headers
    assert_response :success
    assert_equal [
      {
        "name" => @practice.name,
        "slug" => "north-memberships",
        "public_path" => "/memberships/north-memberships"
      },
      {
        "name" => @foreign_practice.name,
        "slug" => "south-memberships",
        "public_path" => "/memberships/south-memberships"
      }
    ], response.parsed_body.fetch("storefronts")

    get "/api/public/membership_storefronts/north-memberships", headers: @headers
    assert_response :success
    assert_equal @practice.name, response.parsed_body.dig("practice", "name")
    assert_equal [ version_id ], response.parsed_body.fetch("catalog").map { |row| row.fetch("id") }
    refute_includes response.body, "South"

    payload = prospect_payload(version_id:, request_key: "north-contact-1")
    post_prospect("north-memberships", payload)
    assert_response :created
    prospect = @practice.membership_prospects.sole
    assert_equal "outreach", prospect.intent_type
    assert prospect.status_new?
    assert_equal 0, @practice.patients.count
    raw = ApplicationRecord.connection.select_one(
      "SELECT display_name, email_address FROM clinic_membership_prospects WHERE id = #{Integer(prospect.id)}"
    )
    refute_includes raw.fetch("display_name"), "Future Patient"
    refute_includes raw.fetch("email_address"), "future.patient@example.invalid"

    post_prospect("north-memberships", payload)
    assert_response :success
    assert_equal true, response.parsed_body.dig("inquiry", "replayed")
    assert_equal 1, @practice.membership_prospects.count

    post_prospect("north-memberships", prospect_payload(version_id: foreign_version_id, request_key: "wrong-clinic"))
    assert_response :not_found
  end

  test "contact-first lead can be contacted and qualified but cannot start paid onboarding" do
    version_id = publish_catalog(@admin, "Contact")
    configure_storefront(@admin, "contact-memberships", enabled: true)
    post_prospect("contact-memberships", prospect_payload(version_id:, request_key: "contact-request"))
    prospect = @practice.membership_prospects.sole

    sign_in(@admin)
    transition(prospect, "contacted")
    assert_response :success
    transition(prospect.reload, "qualify")
    assert_response :success
    transition(prospect.reload, "start_onboarding")
    assert_response :unprocessable_entity
    assert_equal 0, @practice.patients.count
    assert_equal 0, Clinic::Care::SubscriptionAgreement.where(practice: @practice).count
  end

  test "purchase opens checkout without a patient and verified payment creates onboarding receipt email and portal" do
    version_id = publish_catalog(@admin, "Purchase")
    configure_storefront(@admin, "purchase-memberships", enabled: true)
    gateway = Gateway.new
    payload = prospect_payload(version_id:, request_key: "purchase-request").fetch(:prospect)
    result = Clinic::MembershipGrowth::PublicCheckout.start(practice: @practice, gateway:,
      **payload.except(:request_key).symbolize_keys, request_key: payload.fetch(:request_key))

    assert_equal "https://checkout.stripe.com/c/pay/storefront", result.checkout_url
    prospect = result.prospect.reload
    assert_equal "purchase", prospect.intent_type
    assert prospect.status_checkout_pending?
    assert_equal 0, @practice.patients.count
    assert_equal 0, ActionMailer::Base.deliveries.count
    fields = gateway.calls.find { |method, path, _| method == :post && path == "/v1/checkout/sessions" }.last.fetch(:fields)
    assert_equal prospect.email_address, fields.fetch("customer_email")
    assert_equal prospect.checkout_reference, fields.fetch("metadata[apply_membership_prospect]")

    gateway.mark_paid
    event = { "type" => "checkout.session.completed", "livemode" => false,
      "account" => @connection.account_id, "data" => { "object" => gateway.session } }
    2.times { Clinic::MembershipGrowth::PublicCheckout.webhook(payload: event, gateway:) }

    prospect.reload
    assert prospect.status_paid_onboarding?
    assert prospect.patient_id
    assert prospect.portal_identity_id
    assert prospect.agreement_id
    assert prospect.receipt_id
    assert prospect.onboarding_task_id
    assert prospect.receipt_sent_at
    assert_equal "open", prospect.onboarding_task.state
    assert_equal "front_desk", prospect.onboarding_task.pool_code
    assert_equal "patient_call", prospect.onboarding_task.task_kind
    assert_equal "active", prospect.agreement.current_state
    assert_equal 1, Clinic::BillingReceipt.where(practice: @practice, kind: "subscription_payment").count
    assert_equal 1, ActionMailer::Base.deliveries.count
    mail = ActionMailer::Base.deliveries.sole
    assert_equal [ prospect.email_address ], mail.to
    assert_includes mail.text_part.body.decoded, "Receipt number: #{prospect.receipt_id}"
    assert_includes mail.text_part.body.decoded, "/patient-portal/activate#token="
    sign_in(@admin)
    transition(prospect.reload, "contacted")
    assert_response :success
    assert prospect.reload.status_contacted?
    assert_equal "completed", prospect.onboarding_task.reload.state
    activation_url = mail.text_part.body.decoded.lines.map(&:strip).find { |line| line.include?("/patient-portal/activate#") }
    activation = URI.decode_www_form(URI.parse(activation_url).fragment).to_h
    portal_password = "Synthetic-patient-password-2026!"
    post "/api/patient_portal/invitation/activate", params: { patient_portal_activation: {
      token: activation.fetch("token"), password: portal_password, password_confirmation: portal_password,
      accepted_terms: true, terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION
    } }, headers: csrf_headers, as: :json
    assert_response :created
    assert prospect.reload.status_converted?
  end

  test "mismatched or expired checkout never enters onboarding" do
    version_id = publish_catalog(@admin, "Guarded")
    configure_storefront(@admin, "guarded-memberships", enabled: true)
    gateway = Gateway.new
    payload = prospect_payload(version_id:, request_key: "guarded-purchase").fetch(:prospect)
    prospect = Clinic::MembershipGrowth::PublicCheckout.start(practice: @practice, gateway:,
      **payload.except(:request_key).symbolize_keys, request_key: payload.fetch(:request_key)).prospect
    gateway.mark_paid
    gateway.session["amount_total"] = 1
    event = { "type" => "checkout.session.completed", "livemode" => false,
      "account" => @connection.account_id, "data" => { "object" => gateway.session } }

    assert_raises(Clinic::Billing::StripeGateway::Invalid) do
      Clinic::MembershipGrowth::PublicCheckout.webhook(payload: event, gateway:)
    end
    assert prospect.reload.status_checkout_pending?
    assert_equal 0, @practice.patients.count

    gateway.session["amount_total"] = 7925
    gateway.session.merge!("status" => "expired", "payment_status" => "unpaid", "payment_intent" => nil)
    event["type"] = "checkout.session.expired"
    Clinic::MembershipGrowth::PublicCheckout.webhook(payload: event, gateway:)
    assert prospect.reload.status_checkout_expired?
    assert_equal 0, @practice.patients.count
    assert_equal 0, ActionMailer::Base.deliveries.count
  end

  test "matching session with mismatched payment evidence rolls back every patient and ledger record" do
    version_id = publish_catalog(@admin, "Evidence")
    configure_storefront(@admin, "evidence-memberships", enabled: true)
    gateway = Gateway.new
    payload = prospect_payload(version_id:, request_key: "evidence-purchase").fetch(:prospect)
    prospect = Clinic::MembershipGrowth::PublicCheckout.start(practice: @practice, gateway:,
      **payload.except(:request_key).symbolize_keys, request_key: payload.fetch(:request_key)).prospect
    gateway.mark_paid
    gateway.tamper_application_fee
    event = { "type" => "checkout.session.completed", "livemode" => false,
      "account" => @connection.account_id, "data" => { "object" => gateway.session } }

    assert_raises(Clinic::Billing::StripeGateway::Invalid) do
      Clinic::MembershipGrowth::PublicCheckout.webhook(payload: event, gateway:)
    end
    assert prospect.reload.status_checkout_pending?
    assert_nil prospect.patient_id
    assert_nil prospect.agreement_id
    assert_equal 0, @practice.patients.count
    assert_equal 0, Clinic::PaymentEvent.where(practice: @practice).count
    assert_equal 0, Clinic::BillingReceipt.where(practice: @practice).count
  end

  test "automatic membership uses recurring checkout and enters the same paid onboarding" do
    version_id = publish_catalog(@admin, "Recurring", renewal: "automatic")
    configure_storefront(@admin, "recurring-memberships", enabled: true)
    gateway = Gateway.new
    payload = prospect_payload(version_id:, request_key: "recurring-purchase").fetch(:prospect)
    result = Clinic::MembershipGrowth::PublicCheckout.start(practice: @practice, gateway:,
      **payload.except(:request_key).symbolize_keys, request_key: payload.fetch(:request_key))
    create_fields = gateway.calls.find { |method, path, _| method == :post && path == "/v1/checkout/sessions" }.last.fetch(:fields)
    assert_equal "subscription", create_fields.fetch("mode")
    assert_equal "2.1", create_fields.fetch("subscription_data[application_fee_percent]")

    gateway.mark_paid
    event = { "type" => "checkout.session.completed", "livemode" => false,
      "account" => @connection.account_id, "data" => { "object" => gateway.session } }
    Clinic::MembershipGrowth::PublicCheckout.webhook(payload: event, gateway:)

    prospect = result.prospect.reload
    assert prospect.status_paid_onboarding?
    checkout = Clinic::Billing::StripeCheckout.find_by!(agreement_id: prospect.agreement_id)
    assert_equal "sub_storefrontpaid", checkout.subscription_id
    assert_equal 1, Clinic::Billing::StripeMembershipCycle.where(checkout:).count
    assert_equal 1, ActionMailer::Base.deliveries.count
  end

  test "disabled storefront exposes neither clinic details nor either submission path" do
    version_id = publish_catalog(@admin, "Hidden")
    configure_storefront(@admin, "hidden-memberships", enabled: false)

    get "/api/public/membership_storefronts/hidden-memberships", headers: @headers
    assert_response :not_found
    post_prospect("hidden-memberships", prospect_payload(version_id:, request_key: "hidden-request"))
    assert_response :not_found
    post "/api/public/membership_storefronts/hidden-memberships/checkouts",
      params: { checkout: prospect_payload(version_id:, request_key: "hidden-purchase").fetch(:prospect) },
      headers: csrf_headers, as: :json
    assert_response :not_found
    assert_equal 0, @practice.membership_prospects.count
  end

  private

  def create_staff(practice, email, *permissions)
    user = User.create!(email_address: email, password: @password)
    membership = practice.memberships.create!(user: user)
    grant_permissions!(membership, *permissions)
    user
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def sign_in(user)
    post "/api/session", params: { email_address: user.email_address, password: @password },
      headers: csrf_headers, as: :json
    assert_response :success
  end

  def publish_catalog(user, label, renewal: "none")
    sign_in(user)
    post "/api/clinic/subscription_catalog/family", params: { item: { name: "#{label} program" } },
      headers: csrf_headers, as: :json
    family_id = response.parsed_body.fetch("id")
    patch "/api/clinic/subscription_catalog/family/#{family_id}",
      params: { item: { lock_version: 0, publish: true } }, headers: csrf_headers, as: :json
    post "/api/clinic/subscription_catalog/service", params: { item: { name: "#{label} included visit" } },
      headers: csrf_headers, as: :json
    service_id = response.parsed_body.fetch("id")
    post "/api/clinic/subscription_catalog/package", params: { item: { name: "#{label} membership", family_id: family_id,
      draft: { amount: "79.25", currency: "USD", duration: 1, duration_unit: "months", renewal:,
        cancellation: renewal == "automatic" ? "end_of_term" : "immediate",
        terms: "Synthetic fixed membership terms.", components: [{ service_id: service_id, mode: "included" }] } } },
      headers: csrf_headers, as: :json
    package_id = response.parsed_body.fetch("id")
    post "/api/clinic/subscription_catalog/packages/#{package_id}/publish",
      params: { request_key: "publish-#{label.downcase}", lock_version: 0 }, headers: csrf_headers, as: :json
    response.parsed_body.fetch("id")
  end

  def configure_storefront(user, slug, enabled:)
    sign_in(user)
    patch "/api/clinic/membership_storefront", params: { storefront: { slug:, enabled: } }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def prospect_payload(version_id:, request_key:)
    { prospect: { version_id:, selections: [], display_name: "Future Patient",
      email_address: "future.patient@example.invalid", phone_number: "555-010-2026",
      source: "membership_storefront", outreach_consent: true, request_key: } }
  end

  def post_prospect(slug, payload)
    post "/api/public/membership_storefronts/#{slug}/prospects", params: payload, headers: csrf_headers, as: :json
  end

  def transition(prospect, action)
    patch "/api/clinic/membership_prospects/#{prospect.id}",
      params: { prospect: { action:, lock_version: prospect.lock_version } }, headers: csrf_headers, as: :json
  end
end
