# Gateway responds in memory only. No transport or provider credentials are used.
class WorkflowInvoiceGateway
  attr_reader :calls
  def initialize(amount, cards)
    @amount, @cards, @calls = amount, cards, []
  end
  def request(method, path, **options)
    @calls << [method, path]
    result = case [method, path]
    when [:get, "/v2/core/accounts/acct_property"]
      { "id" => "acct_property", "livemode" => false, "dashboard" => "full",
        "metadata" => { "apply_connection" => "property-connection" },
        "defaults" => { "responsibilities" => { "fees_collector" => "stripe", "losses_collector" => "stripe" } },
        "configuration" => { "merchant" => { "capabilities" => { "card_payments" => { "status" => @cards ? "active" : "inactive" },
          "stripe_balance" => { "payouts" => { "status" => "active" } } } } } }
    when [:post, "/v1/checkout/sessions"]
      @session = { "id" => "cs_test_property", "livemode" => false, "mode" => "payment", "status" => "open",
        "payment_status" => "unpaid", "payment_intent" => nil, "amount_total" => @amount, "currency" => "usd",
        "metadata" => { "apply_collection_intent" => options.fetch(:fields).fetch("metadata[apply_collection_intent]") },
        "url" => "https://checkout.stripe.com/c/pay/property" }
    when [:get, "/v1/checkout/sessions/cs_test_property"] then @session
    when [:post, "/v1/checkout/sessions/cs_test_property/expire"] then @session = @session.merge("status" => "expired", "url" => nil)
    else raise "Unexpected local gateway request: #{method} #{path}"
    end
    result.deep_dup
  end
  def complete_unpaid
    @session = @session.merge("status" => "complete", "payment_status" => "unpaid", "payment_intent" => "pi_property", "url" => nil)
  end
end

class WorkflowPropertyCase
  def provider_invoice_state(input)
    keys = %w[STRIPE_SANDBOX_KEY STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_RETURN_ORIGIN]
    saved = ENV.to_h.slice(*keys)
    ENV["STRIPE_SANDBOX_KEY"] = "rk_test_inmemoryfixture"
    ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_inmemory_fixture"
    ENV["STRIPE_RETURN_ORIGIN"] = "http://127.0.0.1:3200"
    _, invoice = ba_invoice(input.fetch("amount"))
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @actor, request_key: SecureRandom.uuid)
    Clinic::Billing::StripeConnection.create!(practice: @practice, connected_by: @actor,
      reference: "property-connection", account_id: "acct_property", charges_enabled: true, payouts_enabled: true)
    mode = input.fetch("mode")
    gateway = WorkflowInvoiceGateway.new(input.fetch("cents"), mode != "inactive_cards")
    error = nil
    result = nil
    begin
      result = Clinic::Billing::StripeInvoicePayments.start(invoice: invoice, actor: @actor, request_key: SecureRandom.uuid, gateway: gateway)
      if mode == "retry"
        result = Clinic::Billing::StripeInvoicePayments.start(invoice: invoice, actor: @actor, request_key: SecureRandom.uuid, gateway: gateway)
      elsif %w[cancel complete_unpaid].include?(mode)
        gateway.complete_unpaid if mode == "complete_unpaid"
        result = Clinic::Billing::StripeInvoicePayments.cancel(checkout: result.checkout, actor: @actor, request_key: SecureRandom.uuid, gateway: gateway)
      end
    rescue ArgumentError => e
      error = e.message
    end
    { error: error, state: result&.state, checkouts: invoice.invoice_stripe_checkouts.count,
      allocations: invoice.payment_allocations.count, create_calls: gateway.calls.count { |pair| pair == [:post, "/v1/checkout/sessions"] },
      expire_calls: gateway.calls.count { |pair| pair == [:post, "/v1/checkout/sessions/cs_test_property/expire"] } }
  ensure
    keys&.each { |key| saved.key?(key) ? ENV[key] = saved[key] : ENV.delete(key) }
  end

  def provider_membership_state(input)
    grant_permissions!(@membership, "subscription_catalog.write", "subscription_catalog.publish")
    patient = @practice.patients.create!(display_name: "Membership property", reference: SecureRandom.hex(8))
    user = User.create!(email_address: "purchase-#{SecureRandom.hex(8)}@example.invalid", password: SecureRandom.hex(20))
    identity = Clinic::PatientPortal::Identity.create!(practice: @practice, patient: patient, user: user, status: "active", invited_at: Time.current, activated_at: Time.current)
    family = Clinic::Care::SubscriptionFamily.create!(practice: @practice, name: "Membership family", display_order: 0)
    Clinic::Care::SubscriptionCatalog.save(practice: @practice, actor: @actor, kind: "family", id: family.id,
      attributes: { "lock_version" => family.lock_version, "publish" => true })
    option = Clinic::Care::ServiceOption.create!(practice: @practice, name: "Visit")
    package = Clinic::Care::SubscriptionPackage.create!(practice: @practice, family: family, name: "Membership",
      draft: { "amount" => input.fetch("amount"), "duration" => 1, "duration_unit" => "months", "terms" => "One visit",
        "components" => [{ "service_id" => option.id, "mode" => "included" }] })
    version = Clinic::Care::SubscriptionCatalog.publish(practice: @practice, actor: @actor, id: package.id, request_key: SecureRandom.uuid, lock_version: package.lock_version)
    purchase = { identity: identity, actor: user, version_id: version.id, selections: [], request_key: SecureRandom.uuid }
    agreement = Clinic::Care::SubscriptionPurchase.checkout(**purchase)
    second = Clinic::Care::SubscriptionPurchase.checkout(**purchase)
    payment = { agreement: agreement, actor: user, request_key: SecureRandom.uuid }
    Clinic::Billing::SubscriptionPayments.start(**payment)
    blocked = nil
    if input.fetch("mode") == "unknown_recovery"
      Clinic::Billing::SubscriptionPayments.deliver_fixture(agreement: agreement, actor: @actor, outcome: "unknown", request_key: SecureRandom.uuid)
      begin
        Clinic::Billing::SubscriptionPayments.start(**payment.merge(request_key: SecureRandom.uuid))
        blocked = false
      rescue ArgumentError
        blocked = true
      end
    end
    delivery = { agreement: agreement, actor: @actor, outcome: "succeeded", request_key: SecureRandom.uuid }
    2.times { Clinic::Billing::SubscriptionPayments.deliver_fixture(**delivery) }
    { same_purchase: agreement.id == second.id, invoices: patient.invoices.count, state: agreement.reload.current_state,
      allocations: agreement.invoice.payment_allocations.count, receipts: Clinic::BillingReceipt.where(invoice: agreement.invoice).count,
      active_events: agreement.events.where(kind: "active").count, blocked: blocked }
  end
end
