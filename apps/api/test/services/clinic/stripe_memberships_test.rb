require "test_helper"

class StripeMembershipsTest < ActiveSupport::TestCase
  class Gateway
    attr_reader :calls, :session

    def initialize(reference:, amount_cents:)
      @reference = reference
      @amount_cents = amount_cents
      @calls = []
      @invoices = {}
      @payments = {}
    end

    def attach_subscription(invoice:, fee_percent: "2.1")
      @invoices[invoice.fetch("id")] = invoice
      @subscription = {
        "id" => "sub_membership", "livemode" => false,
        "metadata" => { "apply_collection_intent" => @reference },
        "application_fee_percent" => fee_percent,
        "items" => { "data" => [{ "quantity" => 1, "price" => {
          "unit_amount" => @amount_cents, "currency" => "usd",
          "recurring" => { "interval" => "month", "interval_count" => 1 }
        } }], "has_more" => false },
        "collection_method" => "charge_automatically", "trial_end" => nil,
        "pause_collection" => nil, "discounts" => [], "status" => "active",
        "latest_invoice" => invoice.fetch("id"), "cancel_at_period_end" => false
      }
      @session.merge!("status" => "complete", "subscription" => @subscription.fetch("id"))
    end

    def add_invoice(invoice, payment_id: nil)
      @invoices[invoice.fetch("id")] = invoice
      @subscription["latest_invoice"] = invoice.fetch("id")
      return unless payment_id

      @payments[invoice.fetch("id")] = payment_id
    end

    def request(method, path, **options)
      @calls << [method, path, options]
      value = case [method, path]
      when [:get, "/v2/core/accounts/acct_membership"]
        {
          "id" => "acct_membership", "livemode" => false, "dashboard" => "full",
          "metadata" => { "apply_connection" => "membership-connection" },
          "defaults" => { "responsibilities" => { "fees_collector" => "stripe", "losses_collector" => "stripe" } },
          "configuration" => { "merchant" => { "capabilities" => {
            "card_payments" => { "status" => "active" }, "stripe_balance" => { "payouts" => { "status" => "active" } }
          } } }
        }
      when [:post, "/v1/checkout/sessions"]
        fields = options.fetch(:fields)
        @reference = fields.fetch("metadata[apply_collection_intent]")
        @session = {
          "id" => "cs_test_membership", "livemode" => false, "mode" => "subscription",
          "status" => "open", "payment_status" => "unpaid", "subscription" => nil,
          "amount_total" => @amount_cents, "currency" => "usd",
          "metadata" => { "apply_collection_intent" => @reference },
          "url" => "https://checkout.stripe.com/c/pay/test"
        }
      when [:get, "/v1/checkout/sessions/cs_test_membership"]
        @session
      when [:get, "/v1/subscriptions/sub_membership"]
        @subscription
      when [:post, "/v1/subscriptions/sub_membership"]
        @subscription = @subscription.merge("cancel_at_period_end" => true)
      else
        if method == :get && path.start_with?("/v1/invoices/")
          @invoices.fetch(path.delete_prefix("/v1/invoices/"))
        elsif [method, path] == [:get, "/v1/invoice_payments"]
          payment_id = @payments.fetch(options.fetch(:fields).fetch("invoice"))
          { "data" => [{ "amount_paid" => @amount_cents, "payment" => { "payment_intent" => payment_id } }], "has_more" => false }
        elsif method == :get && path.start_with?("/v1/payment_intents/")
          payment_id = path.delete_prefix("/v1/payment_intents/")
          {
            "id" => payment_id, "livemode" => false, "status" => "succeeded",
            "amount_received" => @amount_cents, "currency" => "usd",
            "application_fee_amount" => 53
          }
        else
          raise "Unexpected Stripe request: #{method} #{path}"
        end
      end
      value.deep_dup
    end
  end

  setup do
    @saved_environment = ENV.to_h.slice("STRIPE_SANDBOX_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_RETURN_ORIGIN")
    ENV["STRIPE_SANDBOX_KEY"] = "rk_test_membershipfixture"
    ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_membership_fixture"
    ENV["STRIPE_RETURN_ORIGIN"] = "http://127.0.0.1:3200"

    @practice = Clinic::Practice.create!(name: "Membership Test Clinic")
    @staff = User.create!(email_address: "membership-staff@example.invalid", password: SecureRandom.hex(20))
    membership = @practice.memberships.create!(user: @staff)
    grant_permissions!(membership, "subscription_catalog.write", "subscription_catalog.publish", "billing.read", "billing.payment_record")
    @patient = @practice.patients.create!(display_name: "Membership Test Patient", reference: "MEMBER-001")
    @patient_user = User.create!(email_address: "membership-patient@example.invalid", password: SecureRandom.hex(20))
    @identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: @patient, user: @patient_user,
      status: "active", invited_at: Time.current, activated_at: Time.current)
    family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Memberships")
    Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @staff, kind: "family", id: family.id,
      attributes: { "lock_version" => 0, "publish" => true })
    service = Clinic::Care::ServiceOption.create!(practice: @practice, name: "Membership access")
    package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: family, name: "Monthly membership", draft: {
      "amount" => "25.00", "currency" => "USD", "duration" => 1, "duration_unit" => "months",
      "renewal" => "automatic", "cancellation" => "end_of_term", "max_per_patient" => 1,
      "terms" => "Renews monthly until canceled.", "components" => [{ "service_id" => service.id, "mode" => "included" }]
    })
    @version = Clinic::Care::SubscriptionCatalog.publish(practice: @practice, actor: @staff, id: package.id,
      request_key: "publish-membership", lock_version: package.lock_version)
    @agreement = Clinic::Care::SubscriptionPurchase.checkout(identity: @identity, actor: @patient_user,
      version_id: @version.id, selections: [], request_key: "purchase-membership")
    @connection = Clinic::Billing::StripeConnection.create!(practice: @practice, connected_by: @staff,
      reference: "membership-connection", account_id: "acct_membership", charges_enabled: true, payouts_enabled: true)
  end

  teardown do
    %w[STRIPE_SANDBOX_KEY STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_RETURN_ORIGIN].each do |key|
      @saved_environment.key?(key) ? ENV[key] = @saved_environment[key] : ENV.delete(key)
    end
  end

  test "monthly checkout is created on the clinic account with the 2.1 percent fee" do
    gateway = begin_checkout
    checkout = stripe_checkout
    create = gateway.calls.find { |method, path, _| method == :post && path == "/v1/checkout/sessions" }
    fields = create.last.fetch(:fields)

    assert_equal "acct_membership", create.last.fetch(:account)
    assert_equal "subscription", fields.fetch("mode")
    assert_equal "month", fields.fetch("line_items[0][price_data][recurring][interval]")
    assert_equal "1", fields.fetch("line_items[0][price_data][recurring][interval_count]")
    assert_equal "2.1", fields.fetch("subscription_data[application_fee_percent]")
    assert_equal 53, checkout.application_fee_cents
    assert_not_includes fields.to_json, @patient.display_name
  end

  test "a signed paid invoice creates one cycle, payment, receipt, and access period across replay" do
    gateway = begin_checkout
    invoice = paid_invoice(id: "in_initial", payment_id: "pi_initial", reason: "subscription_create")
    gateway.attach_subscription(invoice: invoice)
    gateway.add_invoice(invoice, payment_id: "pi_initial")

    2.times { deliver_invoice(gateway, id: "evt_initial_paid", invoice_id: "in_initial") }

    assert_equal 1, Clinic::Billing::StripeMembershipCycle.where(checkout: stripe_checkout).count
    assert_equal 1, @agreement.invoice.payment_allocations.count
    assert_equal 1, Clinic::BillingReceipt.where(invoice: @agreement.invoice, kind: "subscription_payment").count
    assert_equal 1, @agreement.events.where(kind: "active").count
  end

  test "an unpaid renewal records the amount due without extending membership dates" do
    gateway = begin_checkout
    initial = paid_invoice(id: "in_initial", payment_id: "pi_initial", reason: "subscription_create")
    gateway.attach_subscription(invoice: initial)
    gateway.add_invoice(initial, payment_id: "pi_initial")
    deliver_invoice(gateway, id: "evt_initial_paid", invoice_id: "in_initial")
    ends_at = @agreement.events.find_by!(kind: "active").details.fetch("ends_at")
    open_invoice = paid_invoice(id: "in_unpaid", payment_id: "pi_unpaid", reason: "subscription_cycle").merge(
      "status" => "open", "amount_paid" => 0, "amount_remaining" => 2500, "status_transitions" => { "paid_at" => nil }
    )
    gateway.add_invoice(open_invoice)

    deliver_invoice(gateway, id: "evt_unpaid", invoice_id: "in_unpaid", type: "invoice.payment_failed")

    checkout = stripe_checkout.reload
    assert_equal "open", checkout.renewal_invoice_status
    assert_equal BigDecimal("25.00"), checkout.renewal_amount_due
    assert_equal ends_at, @agreement.events.find_by!(kind: "active").details.fetch("ends_at")
    assert_equal 1, Clinic::Billing::StripeMembershipCycle.where(checkout: checkout).count
  end

  test "signed events cannot route a foreign account or subscription into this ledger" do
    gateway = begin_checkout
    invoice = paid_invoice(id: "in_wrong_route", payment_id: "pi_wrong_route", reason: "subscription_create")
    gateway.attach_subscription(invoice: invoice)
    gateway.add_invoice(invoice, payment_id: "pi_wrong_route")

    assert_nil deliver_invoice(gateway, id: "evt_foreign", invoice_id: invoice.fetch("id"), account: "acct_foreign")
    gateway.add_invoice(invoice.deep_merge("parent" => { "subscription_details" => { "subscription" => "sub_foreign" } }),
      payment_id: "pi_wrong_route")
    assert_raises(Clinic::Billing::StripeGateway::Invalid) do
      deliver_invoice(gateway, id: "evt_wrong_subscription", invoice_id: invoice.fetch("id"))
    end
    assert_empty @agreement.invoice.payment_allocations
  end

  test "renewal fee drift is rejected before ledger activity" do
    gateway = begin_checkout
    invoice = paid_invoice(id: "in_wrong_fee", payment_id: "pi_wrong_fee", reason: "subscription_create")
    gateway.attach_subscription(invoice: invoice, fee_percent: "2.0")
    gateway.add_invoice(invoice, payment_id: "pi_wrong_fee")

    assert_raises(Clinic::Billing::StripeGateway::Invalid) do
      deliver_invoice(gateway, id: "evt_wrong_fee", invoice_id: invoice.fetch("id"))
    end
    assert_empty @agreement.invoice.payment_allocations
  end

  test "cancellation stays active through the paid end and asks Stripe for no proration" do
    gateway = begin_checkout
    invoice = paid_invoice(id: "in_initial", payment_id: "pi_initial", reason: "subscription_create")
    gateway.attach_subscription(invoice: invoice)
    gateway.add_invoice(invoice, payment_id: "pi_initial")
    deliver_invoice(gateway, id: "evt_initial_paid", invoice_id: invoice.fetch("id"))

    Clinic::Billing::StripeRecurringPayments.cancel(checkout: stripe_checkout, actor: @patient_user, gateway: gateway)

    cancel = gateway.calls.find { |method, path, _| method == :post && path == "/v1/subscriptions/sub_membership" }
    projection = Clinic::Care::SubscriptionProjection.agreement(@agreement.reload)
    assert_equal({ "cancel_at_period_end" => "true" }, cancel.last.fetch(:fields))
    assert stripe_checkout.reload.cancel_at_period_end
    assert_equal "active", projection.fetch(:state)
    assert_equal projection.fetch(:ends_at), projection.fetch(:cancellation_effective_at)
  end

  private

  def begin_checkout
    gateway = Gateway.new(reference: nil, amount_cents: 2500)
    Clinic::Billing::StripeMembershipPayments.start(agreement: @agreement, actor: @patient_user,
      request_key: "start-membership", gateway: gateway)
    gateway
  end

  def stripe_checkout
    Clinic::Billing::StripeCheckout.find_by!(agreement: @agreement)
  end

  def paid_invoice(id:, payment_id:, reason:)
    start_at = 1.day.ago.change(usec: 0)
    end_at = start_at.advance(months: 1)
    {
      "id" => id, "livemode" => false, "status" => "paid", "amount_paid" => 2500,
      "total" => 2500, "amount_remaining" => 0, "currency" => "usd", "billing_reason" => reason,
      "parent" => { "subscription_details" => { "subscription" => "sub_membership" } },
      "lines" => { "data" => [{ "amount" => 2500,
        "parent" => { "subscription_item_details" => { "proration" => false, "subscription" => "sub_membership" } },
        "period" => { "start" => start_at.to_i, "end" => end_at.to_i }
      }], "has_more" => false },
      "status_transitions" => { "paid_at" => Time.current.to_i }, "test_payment_id" => payment_id
    }.except("test_payment_id")
  end

  def deliver_invoice(gateway, id:, invoice_id:, type: "invoice.paid", account: "acct_membership")
    payload = {
      id: id, type: type, livemode: false, account: account,
      data: { object: { id: invoice_id, parent: { subscription_details: { subscription: "sub_membership" } } } }
    }
    body = JSON.generate(payload)
    timestamp = Time.current.to_i
    signature = OpenSSL::HMAC.hexdigest("SHA256", ENV.fetch("STRIPE_CONNECT_WEBHOOK_SECRET"), "#{timestamp}.#{body}")
    Clinic::Billing::StripeMembershipPayments.webhook(raw_body: body,
      signature_header: "t=#{timestamp},v1=#{signature}", gateway: gateway)
  end
end
