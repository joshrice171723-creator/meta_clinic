require "test_helper"

class StripeInvoicePaymentsTest < ActiveSupport::TestCase
  class Gateway
    attr_reader :calls, :session

    def initialize(amount_cents: 12_500, cards_active: true, payouts_active: true, refunded_cents: 0,
      payment_reference: nil)
      @amount_cents = amount_cents
      @cards_active = cards_active
      @calls = []
      @payouts_active = payouts_active
      @refunded_cents = refunded_cents
      @payment_reference = payment_reference
    end

    def request(method, path, **options)
      @calls << [ method, path, options ]
      case [ method, path ]
      when [ :get, "/v2/core/accounts/acct_invoice" ]
        {
          "id" => "acct_invoice", "livemode" => false, "dashboard" => "full",
          "metadata" => { "apply_connection" => "invoice-connection" },
          "defaults" => { "responsibilities" => { "fees_collector" => "stripe", "losses_collector" => "stripe" } },
          "configuration" => { "merchant" => { "capabilities" => {
            "card_payments" => { "status" => @cards_active ? "active" : "inactive" },
            "stripe_balance" => { "payouts" => { "status" => @payouts_active ? "active" : "inactive" } }
          } } }
        }
      when [ :post, "/v1/checkout/sessions" ]
        fields = options.fetch(:fields)
        @session = {
          "id" => "cs_test_invoice", "livemode" => false, "mode" => "payment",
          "status" => "open", "payment_status" => "unpaid", "payment_intent" => nil,
          "amount_total" => @amount_cents, "currency" => "usd",
          "metadata" => { "apply_collection_intent" => fields.fetch("metadata[apply_collection_intent]") },
          "url" => "https://checkout.stripe.com/c/pay/invoice"
        }
      when [ :get, "/v1/checkout/sessions/cs_test_invoice" ]
        @session
      when [ :post, "/v1/checkout/sessions/cs_test_invoice/expire" ]
        @session = @session.merge("status" => "expired", "url" => nil)
      when [ :get, "/v1/payment_intents/pi_invoice" ]
        {
          "id" => "pi_invoice", "livemode" => false, "status" => "succeeded",
          "amount" => @amount_cents, "amount_received" => @amount_cents,
          "currency" => "usd", "application_fee_amount" => 263,
          "latest_charge" => "ch_invoice",
          "metadata" => { "apply_collection_intent" => @payment_reference || @session.dig("metadata", "apply_collection_intent") }
        }
      when [ :get, "/v1/charges/ch_invoice" ]
        {
          "id" => "ch_invoice", "livemode" => false, "payment_intent" => "pi_invoice",
          "status" => "succeeded", "paid" => true, "created" => Time.utc(2026, 9, 7, 12).to_i,
          "amount" => @amount_cents, "amount_refunded" => @refunded_cents, "currency" => "usd"
        }
      else
        raise "Unexpected Stripe request: #{method} #{path}"
      end.deep_dup
    end

    def mark_paid
      @session = @session.merge("status" => "complete", "payment_status" => "paid", "payment_intent" => "pi_invoice", "url" => nil)
    end

    def mark_complete_unpaid
      @session = @session.merge("status" => "complete", "payment_status" => "unpaid", "payment_intent" => "pi_invoice", "url" => nil)
    end

    def mark_refunded(amount_cents)
      @refunded_cents = amount_cents
    end
  end

  setup do
    @saved_environment = ENV.to_h.slice("STRIPE_SANDBOX_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_RETURN_ORIGIN")
    ENV["STRIPE_SANDBOX_KEY"] = "rk_test_invoicefixture"
    ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_invoice_fixture"
    ENV["STRIPE_RETURN_ORIGIN"] = "http://127.0.0.1:3200"
    @practice = Clinic::Practice.create!(name: "Invoice Checkout Practice")
    @actor = User.create!(email_address: "invoice-checkout@example.invalid", password: SecureRandom.hex(20))
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "billing.invoice_draft", "billing.invoice_post", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "Invoice Checkout Patient", reference: "INVOICE-001")
    @invoice = Clinic::Billing::DraftInvoice.call(practice: @practice, actor: @actor, patient: @patient,
      currency: "USD", lines: [ { quantity: "1", unit_amount: "125.00", description_snapshot: "Office service" } ])
    Clinic::Billing::PostInvoice.call(invoice: @invoice, actor: @actor)
    @connection = Clinic::Billing::StripeConnection.create!(practice: @practice, connected_by: @actor,
      reference: "invoice-connection", account_id: "acct_invoice", charges_enabled: true, payouts_enabled: true)
  end

  teardown do
    %w[STRIPE_SANDBOX_KEY STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_RETURN_ORIGIN].each do |key|
      @saved_environment.key?(key) ? ENV[key] = @saved_environment[key] : ENV.delete(key)
    end
  end

  test "creates one hosted connected-account Checkout and resumes it across retry" do
    gateway = Gateway.new
    first = start_payment(gateway, "invoice-start")
    replay = start_payment(gateway, "invoice-retry")

    assert_equal first.checkout, replay.checkout
    assert_equal "processing", replay.state
    assert_equal "https://checkout.stripe.com/c/pay/invoice", replay.checkout_url
    assert_equal 1, @invoice.invoice_stripe_checkouts.count
    create = gateway.calls.find { |method, path, _| method == :post && path == "/v1/checkout/sessions" }
    assert_equal "acct_invoice", create.last.fetch(:account)
    fields = create.last.fetch(:fields)
    assert_equal "payment", fields.fetch("mode")
    assert_equal "12500", fields.fetch("line_items[0][price_data][unit_amount]")
    assert_equal "263", fields.fetch("payment_intent_data[application_fee_amount]")
    assert_equal "http://127.0.0.1:3200/clinic/billing?invoice_payment=return", fields.fetch("success_url")
    refute_includes fields.to_json, @patient.display_name
    refute_includes fields.to_json, @invoice.lines.first.description_snapshot
    refute fields.keys.any? { |key| key.include?("payment_method_types") }
  end

  test "allows direct invoice checkout when cards are active and payouts are inactive" do
    @connection.update!(payouts_enabled: false)
    gateway = Gateway.new(payouts_active: false)

    result = start_payment(gateway, "invoice-payouts-inactive")

    assert_equal "processing", result.state
    assert gateway.calls.any? { |method, path, _| method == :post && path == "/v1/checkout/sessions" }
  end

  test "denies direct invoice checkout when card payments are inactive" do
    gateway = Gateway.new(cards_active: false, payouts_active: true)

    assert_raises(ArgumentError, match: /card payments/) { start_payment(gateway, "invoice-cards-inactive") }
    refute gateway.calls.any? { |method, path, _| method == :post && path == "/v1/checkout/sessions" }
  end

  test "does not allow balance mutations until confirmed unpaid cancellation" do
    gateway = Gateway.new
    checkout = start_payment(gateway, "invoice-cancel").checkout

    assert_raises(ArgumentError, match: /online payment/) do
      Clinic::Billing::AllocatePayment.call(practice: @practice, actor: @actor, patient: @patient,
        invoice: @invoice, external_event_reference: "manual-blocked", currency: "USD", amount: "10.00")
    end
    result = Clinic::Billing::StripeInvoicePayments.cancel(checkout: checkout, actor: @actor,
      request_key: "cancel-invoice", gateway: gateway)
    assert_equal "canceled", result.state
    assert_equal "canceled", checkout.collection_intent.reload.state

    allocation = Clinic::Billing::AllocatePayment.call(practice: @practice, actor: @actor, patient: @patient,
      invoice: @invoice, external_event_reference: "manual-after-cancel", currency: "USD", amount: "10.00")
    assert_equal BigDecimal("10.00"), allocation.amount
  end

  test "keeps a complete unpaid Checkout in reconciliation" do
    gateway = Gateway.new
    checkout = start_payment(gateway, "invoice-complete-unpaid").checkout
    gateway.mark_complete_unpaid

    result = Clinic::Billing::StripeInvoicePayments.cancel(checkout: checkout, actor: @actor,
      request_key: "cancel-complete-unpaid", gateway: gateway)

    assert_equal "needs_reconciliation", result.state
    assert_equal "needs_reconciliation", checkout.collection_intent.reload.state
    refute gateway.calls.any? { |method, path, _| method == :post && path.end_with?("/expire") }
  end

  test "records verified payment once and leaves a raced excess unapplied" do
    gateway = Gateway.new
    checkout = start_payment(gateway, "invoice-paid").checkout
    raced = Clinic::PaymentEvent.create!(practice: @practice, patient: @patient, currency: "USD",
      amount: "25.00", external_event_reference: "race-before-webhook")
    raced.allocations.create!(practice: @practice, patient: @patient, invoice: @invoice, amount: "25.00")
    gateway.mark_paid

    2.times do
      result = Clinic::Billing::StripeInvoicePayments.reconcile(checkout: checkout, actor: @actor, gateway: gateway)
      assert_equal "paid", result.state
    end

    payment = Clinic::PaymentEvent.find_by!(external_event_reference: "stripe:acct_invoice:pi_invoice")
    assert_equal BigDecimal("125.00"), payment.amount
    assert_equal BigDecimal("100.00"), payment.allocations.sum(:amount)
    assert_equal BigDecimal("25.00"), payment.amount - payment.allocations.sum(:amount)
    assert_equal 1, Clinic::BillingReceipt.where(payment_event: payment, kind: "card_payment").count
    assert_equal "succeeded", checkout.collection_intent.reload.state
  end

  test "records a verified partial refund once without changing invoice settlement" do
    gateway = Gateway.new(refunded_cents: 500)
    checkout = start_payment(gateway, "invoice-refund").checkout
    gateway.mark_paid
    Clinic::Billing::StripeInvoicePayments.reconcile(checkout: checkout, actor: @actor, gateway: gateway)
    newer_intent = @invoice.payment_collection_intents.create!(practice: @practice, patient: @patient,
      reference: "ci_#{'a' * 32}", request_key: "newer-invoice-attempt", processor: "stripe",
      mode: "test", currency: "USD", amount: "125.00", state: "failed")
    Clinic::Billing::InvoiceStripeCheckout.create!(practice: @practice, connection: @connection, invoice: @invoice,
      collection_intent: newer_intent, account_id: @connection.account_id, application_fee_cents: 263)
    payload = {
      "type" => "charge.refunded", "livemode" => false, "account" => "acct_invoice",
      "data" => { "object" => { "id" => "ch_invoice" } }
    }

    2.times { Clinic::Billing::StripeInvoicePayments.webhook(payload: payload, gateway: gateway) }

    payment = Clinic::PaymentEvent.find_by!(external_event_reference: "stripe:acct_invoice:pi_invoice")
    assert_equal BigDecimal("5.00"), payment.refund_events.sum(:amount)
    assert_equal 1, payment.refund_events.count
    assert_equal BigDecimal("125.00"), payment.allocations.sum(:amount)
    assert_equal "posted", @invoice.reload.status
  end

  test "recovers a missed refund when reconciling an already settled checkout" do
    gateway = Gateway.new
    checkout = start_payment(gateway, "invoice-missed-refund").checkout
    gateway.mark_paid
    Clinic::Billing::StripeInvoicePayments.reconcile(checkout: checkout, actor: @actor, gateway: gateway)

    payment = Clinic::PaymentEvent.find_by!(external_event_reference: "stripe:acct_invoice:pi_invoice")
    assert_empty payment.refund_events
    gateway.mark_refunded(500)

    2.times do
      result = Clinic::Billing::StripeInvoicePayments.reconcile(checkout: checkout, actor: @actor, gateway: gateway)
      assert_equal "paid", result.state
    end

    assert_equal BigDecimal("5.00"), payment.refund_events.sum(:amount)
    assert_equal 1, payment.refund_events.count
    assert_equal BigDecimal("125.00"), payment.allocations.sum(:amount)
    assert_equal "succeeded", checkout.collection_intent.reload.state
    assert_equal "posted", @invoice.reload.status
  end

  test "leaves membership-routed refunds for the membership webhook" do
    intent = @invoice.payment_collection_intents.create!(practice: @practice, patient: @patient,
      reference: "ci_#{'b' * 32}", request_key: "membership-refund", processor: "stripe",
      mode: "test", currency: "USD", amount: "125.00", state: "succeeded")
    payment = Clinic::PaymentEvent.create!(practice: @practice, patient: @patient, currency: "USD",
      amount: "125.00", external_event_reference: "stripe:acct_invoice:pi_invoice")
    payment.allocations.create!(practice: @practice, patient: @patient, invoice: @invoice, amount: "125.00")
    payload = {
      "type" => "charge.refunded", "livemode" => false, "account" => "acct_invoice",
      "data" => { "object" => { "id" => "ch_invoice" } }
    }

    result = Clinic::Billing::StripeInvoicePayments.webhook(payload: payload,
      gateway: Gateway.new(refunded_cents: 500, payment_reference: intent.reference))

    assert_nil result
    assert_empty payment.reload.refund_events
  end

  test "rejects membership-owned invoices from the ordinary payment path" do
    family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Memberships")
    package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: family, name: "Membership")
    version = Clinic::Care::SubscriptionVersion.create!(practice: @practice, package: package, number: 1,
      snapshot: {}, request_key: "membership-version", request_digest: "digest")
    Clinic::Care::SubscriptionAgreement.create!(practice: @practice, patient: @patient, package_version: version,
      invoice: @invoice, snapshot: {}, amount: "125.00", currency: "USD",
      request_key: "membership-agreement", request_digest: "digest")

    result = Clinic::Billing::StripeInvoicePayments.eligibility(invoice: @invoice)
    assert_equal "membership_managed", result.fetch(:reason)
    assert_raises(ArgumentError, match: /membership payment/) { start_payment(Gateway.new, "membership-start") }
  end

  private

  def start_payment(gateway, request_key)
    Clinic::Billing::StripeInvoicePayments.start(invoice: @invoice, actor: @actor,
      request_key: request_key, gateway: gateway)
  end
end
