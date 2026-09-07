require "test_helper"

class InvoiceOnlinePaymentsTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @practice = Clinic::Practice.create!(name: "Invoice Checkout Practice")
    @staff = User.create!(email_address: "invoice-checkout-staff@example.invalid", password: @password)
    @membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(@membership, "billing.read", "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "Invoice Checkout Patient", reference: "CHECKOUT-001")
    @invoice = posted_invoice(@practice, @patient, @staff, "owned")
  end

  test "staff start accepts only a request key and returns the nested server projection" do
    sign_in(@staff)
    called = false
    test_case = self
    expected_invoice = @invoice
    expected_staff = @staff
    projection = online_payment_payload("processing", eligible: false, can_cancel: true, reason: "checkout_active")
    with_class_method(Clinic::Billing::StripeInvoicePayments, :start, ->(**arguments) {
      called = true
      test_case.assert_equal expected_invoice, arguments.fetch(:invoice)
      test_case.assert_equal expected_staff, arguments.fetch(:actor)
      test_case.assert_equal "invoice-online-start", arguments.fetch(:request_key)
      test_case.assert_instance_of Clinic::Billing::StripeGateway, arguments.fetch(:gateway)
      Clinic::Billing::StripeInvoicePayments::Result.new(checkout: nil, state: "processing",
        checkout_url: "https://checkout.stripe.com/c/pay/invoice")
    }) do
      with_class_method(Clinic::Billing::StripeInvoicePayments, :eligibility, ->(**) { projection }) do
        post "/api/clinic/invoices/#{@invoice.id}/online_payment/start",
          params: { online_payment: { request_key: "invoice-online-start" } }, headers: csrf_headers, as: :json
      end
    end

    assert called
    assert_response :accepted
    body = response.parsed_body
    assert_equal "https://checkout.stripe.com/c/pay/invoice", body.dig("online_payment", "checkout_url")
    assert_equal "processing", body.dig("online_payment", "state")
    assert_equal @invoice.id, body.dig("invoice", "id")
    refute body.key?("checkout_url")

    post "/api/clinic/invoices/#{@invoice.id}/online_payment/start",
      params: { online_payment: { request_key: "invalid-client-fields", amount: "0.01" } }, headers: csrf_headers, as: :json
    assert_response :bad_request
    assert_equal "amount", response.parsed_body.fetch("field")
  end

  test "staff endpoints require payment authority and preserve practice ownership" do
    reader = User.create!(email_address: "invoice-checkout-reader@example.invalid", password: @password)
    reader_membership = @practice.memberships.create!(user: reader)
    grant_permissions!(reader_membership, "billing.read")
    sign_in(reader)

    post "/api/clinic/invoices/#{@invoice.id}/online_payment/reconcile", params: {}, headers: csrf_headers, as: :json
    assert_response :forbidden

    other_practice = Clinic::Practice.create!(name: "Other Invoice Checkout Practice")
    other_staff = User.create!(email_address: "other-invoice-checkout@example.invalid", password: @password)
    other_membership = other_practice.memberships.create!(user: other_staff)
    grant_permissions!(other_membership, "billing.invoice_draft", "billing.invoice_post")
    other_patient = other_practice.patients.create!(display_name: "Other Checkout Patient", reference: "CHECKOUT-OTHER")
    other_invoice = posted_invoice(other_practice, other_patient, other_staff, "foreign")
    sign_in(@staff)

    post "/api/clinic/invoices/#{other_invoice.id}/online_payment/start",
      params: { online_payment: { request_key: "foreign-invoice" } }, headers: csrf_headers, as: :json
    assert_response :not_found
  end

  test "staff cancel retries the latest terminal checkout instead of losing its idempotent target" do
    sign_in(@staff)
    checkout = invoice_checkout(@invoice, state: "canceled")
    projection = online_payment_payload("available", eligible: true, can_cancel: false, reason: nil)
    called = false
    test_case = self

    with_class_method(Clinic::Billing::StripeInvoicePayments, :cancel, ->(**arguments) {
      called = true
      test_case.assert_equal checkout.id, arguments.fetch(:checkout).id
      Clinic::Billing::StripeInvoicePayments::Result.new(checkout: checkout, state: "canceled", checkout_url: nil)
    }) do
      with_class_method(Clinic::Billing::StripeInvoicePayments, :eligibility, ->(**) { projection }) do
        post "/api/clinic/invoices/#{@invoice.id}/online_payment/cancel",
          params: { online_payment: { request_key: "repeat-terminal-cancel" } }, headers: csrf_headers, as: :json
      end
    end

    assert called
    assert_response :success
    assert_equal "available", response.parsed_body.dig("online_payment", "state")
  end

  test "patient start is limited to its active identity and exact owned invoice" do
    saved_environment, saved_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    patient_user = User.create!(email_address: "synthetic-patient@example.invalid",
      password: Development::TestAccounts.send(:password_for, "patient"))
    Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: patient_user,
      status: "active", invited_at: Time.current, activated_at: Time.current)
    sign_in_patient
    test_case = self
    expected_invoice = @invoice
    projection = online_payment_payload("processing", eligible: false, can_cancel: true, reason: "checkout_active")

    with_class_method(Clinic::Billing::StripeInvoicePayments, :start, ->(**arguments) {
      test_case.assert_equal patient_user, arguments.fetch(:actor)
      test_case.assert_equal expected_invoice, arguments.fetch(:invoice)
      Clinic::Billing::StripeInvoicePayments::Result.new(checkout: nil, state: "processing",
        checkout_url: "https://checkout.stripe.com/c/pay/patient-invoice")
    }) do
      with_class_method(Clinic::Billing::StripeInvoicePayments, :eligibility, ->(**) { projection }) do
        post "/api/patient_portal/invoices/#{@invoice.id}/online_payment/start",
          params: { online_payment: { request_key: "patient-invoice-start" } }, headers: csrf_headers, as: :json
      end
    end
    assert_response :accepted
    assert_equal "https://checkout.stripe.com/c/pay/patient-invoice", response.parsed_body.dig("online_payment", "checkout_url")

    other_patient = @practice.patients.create!(display_name: "Another Checkout Patient", reference: "CHECKOUT-002")
    other_invoice = posted_invoice(@practice, other_patient, @staff, "another-patient")
    post "/api/patient_portal/invoices/#{other_invoice.id}/online_payment/start",
      params: { online_payment: { request_key: "wrong-patient" } }, headers: csrf_headers, as: :json
    assert_response :not_found
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = saved_environment, saved_flag
  end

  test "Omni patient preview cannot start an invoice payment" do
    saved_environment, saved_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    Development::TestAccounts.prepare!
    post "/api/development_session", params: { profile: "omni" }, headers: csrf_headers, as: :json
    assert_response :created

    post "/api/patient_portal/invoices/1/online_payment/start",
      params: { online_payment: { request_key: "omni-preview-denied" } }, headers: csrf_headers, as: :json
    assert_response :forbidden
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = saved_environment, saved_flag
  end

  test "dashboard and patient ledger expose truthful online payment availability and pending state" do
    saved_stripe = ENV.to_h.slice("STRIPE_SANDBOX_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_RETURN_ORIGIN")
    ENV["STRIPE_SANDBOX_KEY"] = "rk_test_invoiceprojection"
    ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_invoice_projection"
    ENV["STRIPE_RETURN_ORIGIN"] = "http://127.0.0.1:3200"
    invoice_checkout(@invoice)
    sign_in(@staff)

    get "/api/clinic/billing", headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.dig("card_collection", "available")
    assert_equal [{ "invoice_id" => @invoice.id, "state" => "processing" }],
      response.parsed_body.fetch("pending_online_payments")

    saved_environment, saved_flag = Rails.env, ENV["APP_DEVELOPMENT_LOGIN"]
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = "development", "1"
    patient_user = User.create!(email_address: "synthetic-patient@example.invalid",
      password: Development::TestAccounts.send(:password_for, "patient"))
    Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: patient_user,
      status: "active", invited_at: Time.current, activated_at: Time.current)
    sign_in_patient

    get "/api/patient_portal/context", headers: @headers
    assert_response :success
    assert_equal true, response.parsed_body.dig("capabilities", "payment_collection")
    invoice = response.parsed_body.dig("billing", "invoices").find { |record| record.fetch("id") == @invoice.id }
    assert_equal "processing", invoice.dig("online_payment", "state")
    assert_equal "checkout_active", invoice.dig("online_payment", "reason")
  ensure
    Rails.env, ENV["APP_DEVELOPMENT_LOGIN"] = saved_environment, saved_flag if defined?(saved_environment)
    %w[STRIPE_SANDBOX_KEY STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_RETURN_ORIGIN].each do |key|
      saved_stripe&.key?(key) ? ENV[key] = saved_stripe.fetch(key) : ENV.delete(key)
    end
  end

  test "signed webhook payload dispatches to ordinary invoice handling before membership handling" do
    saved = ENV.to_h.slice("STRIPE_CONNECT_WEBHOOK_SECRET")
    ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_invoice_dispatch"
    payload = {
      id: "evt_invoice_dispatch", type: "checkout.session.completed", livemode: false,
      account: "acct_unmatched", data: { object: { id: "cs_test_invoice_dispatch" } }
    }
    body = JSON.generate(payload)
    signature = webhook_signature(body)
    invoice_called = false
    test_case = self

    with_class_method(Clinic::Billing::StripeInvoicePayments, :webhook, ->(payload:, gateway:) {
      invoice_called = true
      test_case.assert_equal "evt_invoice_dispatch", payload.fetch("id")
      test_case.assert_instance_of Clinic::Billing::StripeGateway, gateway
      Clinic::Billing::StripeInvoicePayments::Result.new(checkout: nil, state: "paid", checkout_url: nil)
    }) do
      with_class_method(Clinic::Billing::StripeMembershipPayments, :webhook,
        ->(**) { test_case.flunk "membership dispatch must not claim an ordinary invoice event" }) do
        post "/api/stripe/connect/webhook", params: body,
          headers: { "CONTENT_TYPE" => "application/json", "Stripe-Signature" => signature }
      end
    end
    assert invoice_called
    assert_response :no_content

    invoice_called = false
    with_class_method(Clinic::Billing::StripeInvoicePayments, :webhook, ->(**) { invoice_called = true }) do
      post "/api/stripe/connect/webhook", params: body,
        headers: { "CONTENT_TYPE" => "application/json", "Stripe-Signature" => "t=1,v1=invalid" }
    end
    assert_response :bad_request
    refute invoice_called
  ensure
    saved.key?("STRIPE_CONNECT_WEBHOOK_SECRET") ? ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = saved.fetch("STRIPE_CONNECT_WEBHOOK_SECRET") : ENV.delete("STRIPE_CONNECT_WEBHOOK_SECRET")
  end

  private

  def with_class_method(owner, name, replacement)
    original = owner.method(name)
    owner.define_singleton_method(name, replacement)
    yield
  ensure
    owner.define_singleton_method(name, original)
  end

  def online_payment_payload(state, eligible:, can_cancel:, reason:)
    { state: state, eligible: eligible, can_cancel: can_cancel, amount: "25.0", currency: "USD", reason: reason }
  end

  def posted_invoice(practice, patient, actor, label)
    invoice = Clinic::Billing::DraftInvoice.call(practice: practice, actor: actor, patient: patient, currency: "USD",
      lines: [{ quantity: "1", unit_amount: "25.00", description_snapshot: "#{label} service" }],
      request_key: "invoice-checkout-draft-#{label}")
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: actor, request_key: "invoice-checkout-post-#{label}")
  end

  def invoice_checkout(invoice, state: "processing")
    connection = Clinic::Billing::StripeConnection.create!(practice: invoice.practice, connected_by: @staff,
      reference: "invoice-checkout-connection", account_id: "acct_invoicecheckout", charges_enabled: true, payouts_enabled: true)
    intent = invoice.payment_collection_intents.create!(practice: invoice.practice, patient: invoice.patient,
      reference: "ci_#{SecureRandom.hex(16)}", request_key: "invoice-checkout-intent", processor: "stripe",
      mode: "test", currency: invoice.currency, amount: "25.00", state: state)
    invoice.invoice_stripe_checkouts.create!(practice: invoice.practice, connection: connection,
      collection_intent: intent, account_id: connection.account_id, application_fee_cents: 53)
  end

  def sign_in(user)
    post "/api/session", params: { email_address: user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def sign_in_patient
    post "/api/development_session", params: { profile: "patient" }, headers: csrf_headers, as: :json
    assert_response :created
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def webhook_signature(body)
    timestamp = Time.current.to_i
    digest = OpenSSL::HMAC.hexdigest("SHA256", ENV.fetch("STRIPE_CONNECT_WEBHOOK_SECRET"), "#{timestamp}.#{body}")
    "t=#{timestamp},v1=#{digest}"
  end
end
