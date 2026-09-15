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

    def complete_phone_setup
      @setup_intent["status"] = "succeeded"
      @setup_intent["payment_method"] = "pm_phonecard"
      @reader["action"]["status"] = "succeeded"
    end

    def mark_phone_paid
      @subscription["status"] = "active"
      @invoice.merge!("status" => "paid", "amount_paid" => @amount_cents, "amount_remaining" => 0,
        "status_transitions" => { "paid_at" => Time.utc(2026, 9, 12, 18).to_i })
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
      when [ :post, "/v1/checkout/sessions/cs_test_storefront/expire" ]
        @session.merge!("status" => "expired")
      when [ :post, "/v1/customers" ]
        { "id" => "cus_phonecaller", "livemode" => false }
      when [ :post, "/v1/setup_intents" ]
        fields = options.fetch(:fields)
        @reference = fields.fetch("metadata[apply_membership_prospect]")
        @setup_intent = { "id" => "seti_phonecaller", "livemode" => false,
          "status" => "requires_payment_method", "customer" => fields.fetch("customer"),
          "payment_method" => nil, "metadata" => { "apply_membership_prospect" => @reference } }
      when [ :post, "/v1/terminal/readers/tmr_phonefixture/process_setup_intent" ]
        @reader = { "id" => "tmr_phonefixture", "livemode" => false,
          "action" => { "type" => "process_setup_intent", "status" => "in_progress",
            "process_setup_intent" => { "setup_intent" => @setup_intent.fetch("id") } } }
      when [ :get, "/v1/setup_intents/seti_phonecaller" ]
        @setup_intent
      when [ :post, "/v1/products" ]
        { "id" => "prod_phonemembership", "livemode" => false }
      when [ :post, "/v1/prices" ]
        { "id" => "price_phonemonthly", "livemode" => false }
      when [ :post, "/v1/subscriptions" ]
        paid_at = Time.utc(2026, 9, 12, 18).to_i
        @invoice = {
          "id" => "in_phoneinitial", "livemode" => false,
          "parent" => { "subscription_details" => { "subscription" => "sub_phonecaller" } },
          "currency" => "usd", "status" => "open", "amount_paid" => 0,
          "total" => @amount_cents, "amount_remaining" => @amount_cents,
          "billing_reason" => "subscription_create", "status_transitions" => { "paid_at" => nil },
          "lines" => { "data" => [{ "amount" => @amount_cents,
            "parent" => { "subscription_item_details" => { "proration" => false,
              "subscription" => "sub_phonecaller" } },
            "period" => { "start" => paid_at, "end" => 1.month.from_now.to_i } }], "has_more" => false }
        }
        @subscription = {
          "id" => "sub_phonecaller", "livemode" => false, "customer" => "cus_phonecaller",
          "default_payment_method" => "pm_phonecard", "status" => "incomplete",
          "metadata" => { "apply_membership_prospect" => @reference,
            "apply_collection_intent" => @reference }, "application_fee_percent" => "2.1",
          "items" => { "data" => [{ "quantity" => 1, "price" => {
            "id" => "price_phonemonthly", "unit_amount" => @amount_cents, "currency" => "usd",
            "recurring" => { "interval" => "month", "interval_count" => 1 } } }], "has_more" => false },
          "collection_method" => "charge_automatically", "trial_end" => nil, "pause_collection" => nil,
          "discounts" => [], "latest_invoice" => @invoice, "cancel_at_period_end" => false
        }
      when [ :get, "/v1/subscriptions/sub_phonecaller" ]
        @subscription.merge("latest_invoice" => "in_phoneinitial")
      when [ :get, "/v1/invoices/in_phoneinitial" ]
        @invoice
      when [ :get, "/v1/payment_intents/pi_phoneinitial" ]
        { "id" => "pi_phoneinitial", "livemode" => false, "status" => "succeeded",
          "amount_received" => @amount_cents, "amount" => @amount_cents, "currency" => "usd",
          "application_fee_amount" => @application_fee_cents, "latest_charge" => "ch_phoneinitial",
          "metadata" => { "apply_collection_intent" => @reference } }
      when [ :get, "/v1/charges/ch_phoneinitial" ]
        { "id" => "ch_phoneinitial", "livemode" => false, "payment_intent" => "pi_phoneinitial",
          "status" => "succeeded", "paid" => true, "created" => Time.utc(2026, 9, 12, 18).to_i,
          "currency" => "usd", "amount" => @amount_cents, "amount_refunded" => 0 }
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
          "payment" => { "payment_intent" => @subscription ? "pi_phoneinitial" : "pi_storefrontpaid" } }],
          "has_more" => false }
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
    @saved_stripe = ENV.to_h.slice("STRIPE_SANDBOX_KEY", "STRIPE_SANDBOX_ACCOUNT_ID",
      "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_RETURN_ORIGIN", "STRIPE_MOTO_READER_ID")
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    ENV["STRIPE_SANDBOX_KEY"] = "rk_test_storefrontfixture"
    ENV["STRIPE_SANDBOX_ACCOUNT_ID"] = "disabled"
    ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_storefront_fixture"
    ENV["STRIPE_RETURN_ORIGIN"] = "http://127.0.0.1:3200"
    ENV["STRIPE_MOTO_READER_ID"] = "tmr_phonefixture"
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
    %w[STRIPE_SANDBOX_KEY STRIPE_SANDBOX_ACCOUNT_ID STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_RETURN_ORIGIN
      STRIPE_MOTO_READER_ID].each do |key|
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

  test "a name and phone number create a prospective patient without requiring email" do
    version_id = publish_catalog(@admin, "Phone")
    configure_storefront(@admin, "phone-memberships", enabled: true)
    payload = prospect_payload(version_id:, request_key: "phone-contact")
    payload.fetch(:prospect)[:email_address] = nil

    post_prospect("phone-memberships", payload)

    assert_response :created
    prospect = @practice.membership_prospects.sole
    assert_nil prospect.email_address
    assert_equal "555-010-2026", prospect.phone_number
    assert_equal "prospective_patient", prospect.relationship_stage
    refute prospect.possible_duplicate?
    assert_nil prospect.patient_id
  end

  test "staff can enroll a prospective patient from published terms even when the public page is disabled" do
    version_id = publish_catalog(@admin, "FrontDesk")
    sign_in(@admin)
    payload = { enrollment: { version_id:, selections: [], display_name: "Desk Enrollment",
      email_address: "desk.enrollment@example.invalid", phone_number: "555-010-3030",
      contact_consent: true, request_key: "front-desk-enrollment-1" } }

    get "/api/clinic/membership_enrollment", headers: @headers
    assert_response :success
    assert_equal [ version_id ], response.parsed_body.fetch("catalog").map { |row| row.fetch("id") }

    post "/api/clinic/membership_enrollment", params: payload, headers: csrf_headers, as: :json
    assert_response :created
    prospect = @practice.membership_prospects.sole
    assert_equal "front_desk_enrollment", prospect.source
    assert_equal "purchase", prospect.intent_type
    assert_equal "open", prospect.follow_up_state
    assert_equal "prospective_patient", prospect.relationship_stage
    assert_equal 0, @practice.patients.count

    post "/api/clinic/membership_enrollment", params: payload, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal true, response.parsed_body.fetch("replayed")
    assert_equal 1, @practice.membership_prospects.count
  end

  test "staff enrollment saves a review-required membership but blocks phone payment" do
    version_id = publish_catalog(@admin, "Review", eligibility_review: true)
    sign_in(@admin)
    post "/api/clinic/membership_enrollment", params: { enrollment: { version_id:, selections: [],
      display_name: "Review Enrollment", email_address: "review.enrollment@example.invalid",
      contact_consent: true, request_key: "review-required-enrollment" } }, headers: csrf_headers, as: :json
    assert_response :created
    prospect = @practice.membership_prospects.sole

    transition(prospect, "begin_call")
    assert_response :success
    assert_raises(ArgumentError, "This membership requires clinic review before payment.") do
      Clinic::MembershipGrowth::StaffPhonePayment.start(
        practice: @practice,
        actor: @admin,
        prospect_id: prospect.id,
        lock_version: prospect.reload.lock_version,
        authorization_confirmed: true,
        authorization_version: Clinic::MembershipGrowth::StaffPhonePayment::AUTHORIZATION_VERSION,
        gateway: Gateway.new
      )
    end
    assert prospect.reload.status_new?
    assert_nil prospect.staff_payment_status
    assert_equal 0, @practice.patients.count
  end

  test "membership account is created before checkout and verified payment reuses it for portal access" do
    version_id = publish_catalog(@admin, "AccountFirst")
    configure_storefront(@admin, "account-first-memberships", enabled: true)
    payload = prospect_payload(version_id:, request_key: "account-first-request").fetch(:prospect)

    prepared = Clinic::MembershipGrowth::PrepareAccount.call(practice: @practice,
      **payload.symbolize_keys, date_of_birth: "1990-02-28")
    prospect = prepared.prospect
    assert prospect.status_new?
    assert prospect.account_user
    refute prospect.account_user.active?
    assert prospect.account_setup_token_digest
    assert_equal "open", prospect.follow_up_state
    assert_equal "email_verification_pending", prospect.enrollment_stage
    assert_nil prospect.patient_id
    assert_equal 1, ActionMailer::Base.deliveries.count
    setup_mail = ActionMailer::Base.deliveries.sole
    setup_url = setup_mail.text_part.body.decoded.lines.map(&:strip)
      .find { |line| line.include?("/memberships/account/activate#") }
    token = URI.decode_www_form(URI.parse(setup_url).fragment).to_h.fetch("token")

    gateway = Gateway.new
    assert_raises(ArgumentError) do
      Clinic::MembershipGrowth::PublicCheckout.start_for_account(practice: @practice,
        prospect:, user: prospect.account_user, gateway:)
    end
    assert_empty gateway.calls
    get "/api/clinic/membership_prospects", headers: @headers
    assert_equal "email_verification_pending", response.parsed_body.fetch("prospects").sole.fetch("enrollment_stage")

    delete "/api/session", headers: csrf_headers
    post "/api/public/membership_accounts/checkout", headers: csrf_headers, as: :json
    assert_response :unauthorized
    password = "Synthetic-account-password-2026!"
    post "/api/public/membership_accounts/activate", params: { membership_account: {
      token:, password:, password_confirmation: password,
      accepted_terms: true, terms_version: Clinic::PatientPortal::Identity::TERMS_VERSION
    } }, headers: csrf_headers, as: :json
    assert_response :created
    assert_equal "/memberships/account", response.parsed_body.dig("account", "redirect_to")
    assert prospect.account_user.reload.active?
    assert prospect.reload.account_activated_at
    assert_nil prospect.account_setup_token_digest
    assert_equal "payment_pending", prospect.enrollment_stage

    delete "/api/session", headers: csrf_headers
    post "/api/session", params: { email_address: prospect.email_address, password: }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "/memberships/account", response.parsed_body.fetch("destination")
    get "/api/public/membership_accounts/current", headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.dig("enrollment", "can_pay")

    original_gateway_constructor = Clinic::Billing::StripeGateway.method(:new)
    Clinic::Billing::StripeGateway.define_singleton_method(:new) { gateway }
    begin
      post "/api/public/membership_accounts/checkout", headers: csrf_headers, as: :json
    ensure
      Clinic::Billing::StripeGateway.define_singleton_method(:new, original_gateway_constructor)
    end
    assert_response :success
    assert_equal "checkout_pending", prospect.reload.status
    assert_equal 0, @practice.patients.count
    assert_nil prospect.agreement_id
    assert_nil prospect.onboarding_task_id
    assert_equal "open", prospect.follow_up_state
    fields = gateway.calls.find { |method, path, _| method == :post && path == "/v1/checkout/sessions" }.last.fetch(:fields)
    assert_equal "http://127.0.0.1:3200/memberships/account", fields.fetch("success_url")
    assert_equal fields.fetch("success_url"), fields.fetch("cancel_url")

    gateway.mark_paid
    event = { "type" => "checkout.session.completed", "livemode" => false,
      "account" => @connection.account_id, "data" => { "object" => gateway.session } }
    Clinic::MembershipGrowth::PublicCheckout.webhook(payload: event, gateway:)
    Clinic::MembershipGrowth::PublicCheckout.webhook(payload: event, gateway:)

    prospect.reload
    assert prospect.status_paid_onboarding?
    assert_equal prospect.account_user_id, prospect.portal_identity.user_id
    assert prospect.portal_identity.active?
    assert_nil prospect.portal_setup_token
    assert_equal 2, ActionMailer::Base.deliveries.count
    receipt_mail = ActionMailer::Base.deliveries.last
    assert_includes receipt_mail.text_part.body.decoded, "/patient-portal"
    refute_includes receipt_mail.text_part.body.decoded, "/patient-portal/activate#"
    assert_equal 1, @practice.patients.count
    assert_equal Date.new(1990, 2, 28), prospect.patient.demographics.date_of_birth
    assert_nil prospect.patient.demographics.interpreter_required
    assert_equal "completed", prospect.follow_up_state
    assert prospect.onboarding_task
    get "/api/public/membership_accounts/current", headers: @headers
    assert_response :success
    assert_equal "/patient-portal?stripe_payment=return#onboarding", response.parsed_body.dig("enrollment", "redirect_to")
    get "/api/patient_portal/context", headers: @headers
    assert_response :success

    sign_in(@admin)
    get "/api/clinic/membership_prospects", headers: @headers
    assert_response :success
    assert_empty response.parsed_body.fetch("prospects")
    get "/api/public/membership_accounts/current", headers: @headers
    assert_response :not_found
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
    assert_includes fields.fetch("success_url"), "#handoff_token=#{prospect.checkout_reference}"

    post "/api/public/membership_storefronts/purchase-memberships/checkouts/handoff",
      params: { handoff: { token: prospect.checkout_reference } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "preparing", response.parsed_body.dig("onboarding", "status")

    post "/api/public/membership_storefronts/purchase-memberships/checkouts/handoff",
      params: { handoff: { token: "ci_#{'0' * 32}" } }, headers: csrf_headers, as: :json
    assert_response :not_found

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
    assert prospect.portal_setup_token
    assert_equal prospect.portal_identity.invitation_expires_at, prospect.portal_setup_expires_at
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

    post "/api/public/membership_storefronts/purchase-memberships/checkouts/handoff",
      params: { handoff: { token: prospect.checkout_reference } }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "ready", response.parsed_body.dig("onboarding", "status")
    assert_includes response.parsed_body.dig("onboarding", "redirect_to"), "/patient-portal/activate#token="

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
    assert_nil prospect.portal_setup_token
    assert_nil prospect.portal_setup_expires_at
  end

  test "worker takes a recurring phone payment without exposing another caller or creating a patient before verification" do
    version_id = publish_catalog(@admin, "Assisted", renewal: "automatic")
    configure_storefront(@admin, "assisted-memberships", enabled: true)
    gateway = Gateway.new
    payload = prospect_payload(version_id:, request_key: "assisted-purchase").fetch(:prospect)
    prospect = Clinic::MembershipGrowth::PublicCheckout.start(practice: @practice, gateway:,
      **payload.except(:request_key).symbolize_keys, request_key: payload.fetch(:request_key)).prospect.reload

    assert prospect.status_checkout_pending?
    assert_equal "open", prospect.follow_up_state
    assert_equal 0, prospect.follow_up_attempt_count
    assert_nil prospect.patient_id

    sign_in(@admin)
    transition(prospect, "begin_call")
    assert_response :success
    prospect.reload
    assert_equal "in_progress", prospect.follow_up_state
    assert_equal @practice.memberships.find_by!(user: @admin).id,
      prospect.follow_up_assigned_to_membership_id
    assert_equal 1, prospect.follow_up_attempt_count

    payment = Clinic::MembershipGrowth::StaffPhonePayment.start(practice: @practice, actor: @admin,
      prospect_id: prospect.id, lock_version: prospect.lock_version, authorization_confirmed: true,
      authorization_version: Clinic::MembershipGrowth::StaffPhonePayment::AUTHORIZATION_VERSION, gateway:)
    assert_equal "awaiting_card", payment.payment.fetch(:status)
    prospect.reload
    assert prospect.status_payment_processing?
    assert_equal "waiting", prospect.follow_up_state
    assert_equal "phone_payment_started", prospect.follow_up_outcome
    assert prospect.recurring_authorized_at
    assert_equal @practice.memberships.find_by!(user: @admin), prospect.recurring_authorized_by_membership
    assert_equal "cus_phonecaller", prospect.staff_payment_customer_id
    assert_equal "seti_phonecaller", prospect.staff_payment_setup_intent_id
    assert_nil prospect.patient_id
    assert_equal 0, @practice.patients.count
    assert_equal 1, gateway.calls.count { |method, path, _| method == :post && path == "/v1/checkout/sessions" }
    assert gateway.calls.any? { |method, path, _| method == :post && path == "/v1/checkout/sessions/cs_test_storefront/expire" }

    gateway.complete_phone_setup
    processing = Clinic::MembershipGrowth::StaffPhonePayment.refresh(practice: @practice, actor: @admin,
      prospect_id: prospect.id, gateway:)
    assert_equal "payment_processing", processing.payment.fetch(:status)
    assert_equal "sub_phonecaller", prospect.reload.staff_payment_subscription_id
    assert_nil prospect.patient_id
    assert_equal 0, @practice.patients.count

    gateway.mark_phone_paid
    paid = Clinic::MembershipGrowth::StaffPhonePayment.refresh(practice: @practice, actor: @admin,
      prospect_id: prospect.id, gateway:)
    assert_equal "paid", paid.payment.fetch(:status)

    prospect.reload
    assert prospect.status_paid_onboarding?
    assert_equal "completed", prospect.follow_up_state
    assert_equal "payment_verified", prospect.follow_up_outcome
    assert_nil prospect.follow_up_due_at
    assert prospect.patient_id
    assert prospect.agreement_id
    assert prospect.receipt_id
    assert prospect.portal_identity_id
    assert prospect.onboarding_task_id
  end

  test "temporary platform sandbox opens checkout without rewriting clinic routing" do
    ENV["STRIPE_SANDBOX_ACCOUNT_ID"] = "acct_platformsandbox"
    version_id = publish_catalog(@admin, "PlatformSandbox")
    configure_storefront(@admin, "temporary-sandbox-memberships", enabled: true)
    gateway = Gateway.new
    payload = prospect_payload(version_id:, request_key: "temporary-sandbox-purchase").fetch(:prospect)

    result = Clinic::MembershipGrowth::PublicCheckout.start(practice: @practice, gateway:,
      **payload.except(:request_key).symbolize_keys, request_key: payload.fetch(:request_key))

    create = gateway.calls.find { |method, path, _| method == :post && path == "/v1/checkout/sessions" }
    assert_equal "acct_platformsandbox", create.last.fetch(:account)
    refute create.last.fetch(:fields).key?("payment_intent_data[application_fee_amount]")
    assert_equal "acct_storefront", @connection.reload.account_id
    assert_equal "acct_platformsandbox", result.prospect.reload.checkout_account_id
    assert_equal 0, result.prospect.application_fee_cents
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

  test "adult account boundaries preserve contact first and interrupted identity without merging people" do
    travel_to Time.utc(2026, 9, 14, 12) do
      version_id = publish_catalog(@admin, "AgeBoundary")
      configure_storefront(@admin, "age-boundary-memberships", enabled: true)
      attributes = prospect_payload(version_id:, request_key: "adult-account").fetch(:prospect)
      [nil, "invalid", "2026-02-30", "2026-09-15", "2008-09-15", "1876-09-14"].each do |date|
        assert_no_difference ["User.count", "Clinic::MembershipProspect.count"] do
          assert_raises(ArgumentError) do
            Clinic::MembershipGrowth::PrepareAccount.call(practice: @practice, **attributes, date_of_birth: date)
          end
        end
      end
      contact = attributes.merge(request_key: "contact-without-age", preferred_contact_method: "phone",
        preferred_contact_time: "Afternoons")
      post_prospect("age-boundary-memberships", { prospect: contact })
      assert_response :created
      assert_nil @practice.membership_prospects.order(:id).last.account_user_id
      first = Clinic::MembershipGrowth::PrepareAccount.call(practice: @practice, **attributes, date_of_birth: "2008-09-14").prospect
      retry_account = Clinic::MembershipGrowth::PrepareAccount.call(practice: @practice,
        **attributes.merge(request_key: "recovered-browser-key"), date_of_birth: "2008-09-14").prospect
      assert_equal first.id, retry_account.id
      assert_equal first.account_user_id, retry_account.account_user_id
      assert_nil first.patient_id
      assert_raises(Clinic::MembershipGrowth::CaptureProspect::Conflict) do
        Clinic::MembershipGrowth::PrepareAccount.call(practice: @practice, **attributes, date_of_birth: "1990-01-01")
      end
      assert_equal Date.new(2008, 9, 14), first.reload.date_of_birth
    end
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

  def publish_catalog(user, label, renewal: "none", eligibility_review: false)
    sign_in(user)
    post "/api/clinic/subscription_catalog/family", params: { item: { name: "#{label} program" } },
      headers: csrf_headers, as: :json
    family_id = response.parsed_body.fetch("id")
    patch "/api/clinic/subscription_catalog/family/#{family_id}",
      params: { item: { lock_version: 0, publish: true } }, headers: csrf_headers, as: :json
    post "/api/clinic/subscription_catalog/service", params: { item: { name: "#{label} included visit" } },
      headers: csrf_headers, as: :json
    service_id = response.parsed_body.fetch("id")
    draft = { amount: "79.25", currency: "USD", duration: 1, duration_unit: "months", renewal:,
      cancellation: renewal == "automatic" ? "end_of_term" : "immediate",
      terms: "Synthetic fixed membership terms.", components: [{ service_id: service_id, mode: "included" }] }
    draft[:eligibility_review] = true if eligibility_review
    post "/api/clinic/subscription_catalog/package", params: { item: { name: "#{label} membership", family_id: family_id, draft: } },
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
