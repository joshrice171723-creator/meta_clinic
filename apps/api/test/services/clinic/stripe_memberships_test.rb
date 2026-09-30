require "test_helper"

class StripeMembershipsTest < ActiveSupport::TestCase
  class Gateway
    attr_reader :calls, :session

    def initialize(reference:, amount_cents:, cards_active: true, payouts_active: true)
      @reference = reference
      @amount_cents = amount_cents
      @cards_active = cards_active
      @calls = []
      @invoices = {}
      @payments = {}
      @payouts_active = payouts_active
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
            "card_payments" => { "status" => @cards_active ? "active" : "inactive" },
            "stripe_balance" => { "payouts" => { "status" => @payouts_active ? "active" : "inactive" } }
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

  test "allows direct membership checkout when cards are active and payouts are inactive" do
    @connection.update!(payouts_enabled: false)
    gateway = Gateway.new(reference: nil, amount_cents: 2500, payouts_active: false)

    Clinic::Billing::StripeMembershipPayments.start(agreement: @agreement, actor: @patient_user,
      request_key: "start-membership-payouts-inactive", gateway: gateway)

    assert gateway.calls.any? { |method, path, _| method == :post && path == "/v1/checkout/sessions" }
  end

  test "denies direct membership checkout when card payments are inactive" do
    gateway = Gateway.new(reference: nil, amount_cents: 2500, cards_active: false)

    assert_raises(ArgumentError, match: /card payments/) do
      Clinic::Billing::StripeMembershipPayments.start(agreement: @agreement, actor: @patient_user,
        request_key: "start-membership-cards-inactive", gateway: gateway)
    end
    refute gateway.calls.any? { |method, path, _| method == :post && path == "/v1/checkout/sessions" }
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

  test "a successful second cycle extends the paid period once across duplicate and older event replay" do
    gateway = initial_paid_cycle
    initial_ledger = recurring_ledger_snapshot
    identity = @identity.attributes
    agreement = @agreement.attributes
    initial_end = Time.utc(2026, 2, 15, 12)
    renewal_end = initial_end.advance(months: 1)

    with_recurring_clock(initial_end) do
      renewal = paid_invoice(id: "in_second", payment_id: "pi_second", reason: "subscription_cycle",
        start_at: initial_end, paid_at: initial_end)
      gateway.add_invoice(renewal, payment_id: "pi_second")
      calls_before = gateway.calls.length
      deliver_invoice(gateway, id: "evt_second_paid", invoice_id: "in_second")

      renewed_ledger = recurring_ledger_snapshot
      initial_ledger.each do |kind, rows|
        assert_equal rows.length + 1, renewed_ledger.fetch(kind).length, "Exactly one new #{kind} row"
        assert_equal rows, renewed_ledger.fetch(kind).first(rows.length), "Existing #{kind} must stay unchanged"
      end
      cycle = Clinic::Billing::StripeMembershipCycle.find_by!(checkout: stripe_checkout, provider_invoice_id: "in_second")
      assert_equal [initial_end, renewal_end], [cycle.period_start, cycle.period_end]
      assert_equal "pi_second", cycle.provider_payment_id
      assert_not_equal @agreement.invoice_id, cycle.invoice_id
      assert_equal BigDecimal("25.00"), cycle.invoice.lines.sum(:posted_amount)
      assert_equal BigDecimal("25.00"), cycle.invoice.payment_allocations.sole.amount
      assert_equal "USD", cycle.invoice.payment_allocations.sole.payment_event.currency
      projection = Clinic::Care::SubscriptionProjection.agreement(@agreement.reload)
      assert_equal "active", projection.fetch(:state)
      assert_equal [initial_end.iso8601, renewal_end.iso8601], projection.values_at(:starts_at, :ends_at)
      assert_equal ["paid", "0.0"], projection.values_at(:renewal_invoice_status, :renewal_amount_due)
      assert_equal identity, @identity.reload.attributes
      assert_equal agreement, @agreement.reload.attributes
      assert gateway.calls.drop(calls_before).all? { |method, _, _| method == :get }

      [
        ["evt_second_paid", "in_second"],
        ["evt_second_replayed", "in_second"],
        ["evt_initial_late", "in_initial"]
      ].each do |event_id, invoice_id|
        deliver_invoice(gateway, id: event_id, invoice_id: invoice_id)
        assert_equal renewed_ledger, recurring_ledger_snapshot, "Replay must not add or change ledger evidence"
        current = Clinic::Care::SubscriptionProjection.agreement(@agreement.reload)
        assert_equal projection.values_at(:state, :starts_at, :ends_at, :renewal_invoice_status, :renewal_amount_due),
          current.values_at(:state, :starts_at, :ends_at, :renewal_invoice_status, :renewal_amount_due)
      end
    end
  end

  test "an unpaid second cycle cannot create paid evidence or extend the prior period" do
    gateway = initial_paid_cycle
    ledger = recurring_ledger_snapshot
    prior_end = Clinic::Care::SubscriptionProjection.agreement(@agreement).fetch(:ends_at)
    with_recurring_clock(Time.utc(2026, 2, 15, 12)) do
      unpaid = paid_invoice(id: "in_secondunpaid", payment_id: "pi_secondunpaid", reason: "subscription_cycle",
        start_at: Time.current, paid_at: Time.current).merge(
          "status" => "open", "amount_paid" => 0, "amount_remaining" => 2500,
          "status_transitions" => { "paid_at" => nil }
        )
      # No payment is registered: attempting to treat this as paid fails closed in the fake gateway.
      gateway.add_invoice(unpaid)
      deliver_invoice(gateway, id: "evt_second_unpaid", invoice_id: unpaid.fetch("id"), type: "invoice.payment_failed")
      assert_equal ledger, recurring_ledger_snapshot
      # An event name alone must not turn an unpaid invoice into verified payment.
      deliver_invoice(gateway, id: "evt_second_unpaid_labeled_paid", invoice_id: unpaid.fetch("id"))
      assert_equal ledger, recurring_ledger_snapshot
      projection = Clinic::Care::SubscriptionProjection.agreement(@agreement.reload)
      assert_equal prior_end, projection.fetch(:ends_at)
      assert_equal ["open", "25.0"], projection.values_at(:renewal_invoice_status, :renewal_amount_due)
      payment_lookup = gateway.calls.any? do |_, path, options|
        path == "/v1/invoice_payments" && options.dig(:fields, "invoice") == unpaid.fetch("id")
      end
      refute payment_lookup
    end
  end

  test "foreign account and subscription renewal events preserve both practices paid ledgers" do
    gateway = initial_paid_cycle
    foreign_practice = Clinic::Practice.create!(name: "Foreign Renewal Test Clinic")
    Clinic::Billing::StripeConnection.create!(practice: foreign_practice, connected_by: @staff,
      reference: "foreign-renewal-connection", account_id: "acct_foreign", charges_enabled: true, payouts_enabled: true)
    ledger = recurring_ledger_snapshot(practices: [@practice, foreign_practice])
    prior_end = Clinic::Care::SubscriptionProjection.agreement(@agreement).fetch(:ends_at)
    with_recurring_clock(Time.utc(2026, 2, 15, 12)) do
      renewal = paid_invoice(id: "in_secondforeign", payment_id: "pi_secondforeign", reason: "subscription_cycle",
        start_at: Time.current, paid_at: Time.current)
      gateway.add_invoice(renewal, payment_id: "pi_secondforeign")
      assert_nil deliver_invoice(gateway, id: "evt_second_foreign_account", invoice_id: renewal.fetch("id"), account: "acct_foreign")
      assert_equal ledger, recurring_ledger_snapshot(practices: [@practice, foreign_practice])
      assert_equal prior_end, Clinic::Care::SubscriptionProjection.agreement(@agreement.reload).fetch(:ends_at)

      foreign_subscription = renewal.deep_merge("parent" => { "subscription_details" => { "subscription" => "sub_foreign" } })
      gateway.add_invoice(foreign_subscription, payment_id: "pi_secondforeign")
      calls_before = gateway.calls.length
      error = assert_raises(Clinic::Billing::StripeGateway::Invalid) do
        deliver_invoice(gateway, id: "evt_second_foreign_subscription", invoice_id: renewal.fetch("id"))
      end
      assert_equal "Stripe invoice does not match this membership.", error.message
      assert gateway.calls.drop(calls_before).any? { |method, path, _| method == :get && path == "/v1/invoices/in_secondforeign" }
      assert_equal ledger, recurring_ledger_snapshot(practices: [@practice, foreign_practice])
      assert_equal prior_end, Clinic::Care::SubscriptionProjection.agreement(@agreement.reload).fetch(:ends_at)
    end
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

    member = @practice.memberships.find_by!(user: @staff)
    grant_permissions!(member, "patients.read", "encounters.write")
    site = @practice.sites.create!(code: "RENEWAL-CARE")
    encounter = @practice.encounters.create!(patient: @patient, site:, started_at: 1.hour.ago, status: "open")
    task = Clinic::ClinicalTask.create!(practice: @practice, patient: @patient, encounter:, site:,
      task_kind: "patient_call", pool_code: "clinical", state: "open", source_type: "manual", recorded_by_membership: member)
    work = Clinic::Operations::FollowUpWorklist.call(practice: @practice, actor: @staff)
    attention = work.fetch(:renewal_exceptions).sole
    assert_equal checkout.id, attention.fetch(:id)
    assert_equal @patient.id, attention.fetch(:patient_id)
    assert_equal "Billing team", attention.fetch(:owner)
    assert_equal BigDecimal("25.00"), BigDecimal(attention.fetch(:amount_due))
    assert_includes work.fetch(:clinical_tasks).pluck(:id), task.id
    Clinic::Care::NurseWorkflow.transition_task(practice: @practice, actor: @staff, task:, action: "claim",
      expected_version: task.lock_version, request_key: "renewal-independent-claim")
    Clinic::Care::NurseWorkflow.transition_task(practice: @practice, actor: @staff, task: task.reload, action: "complete",
      expected_version: task.lock_version, request_key: "renewal-independent-complete", resolution_code: "completed")
    assert_equal "completed", task.reload.state
    assert_equal checkout.id, Clinic::Operations::FollowUpWorklist.call(practice: @practice, actor: @staff)
      .fetch(:renewal_exceptions).sole.fetch(:id)
    assert_equal BigDecimal("25.00"), checkout.reload.renewal_amount_due
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

  def paid_invoice(id:, payment_id:, reason:, start_at: 1.day.ago.change(usec: 0), paid_at: Time.current)
    end_at = start_at.advance(months: 1)
    {
      "id" => id, "livemode" => false, "status" => "paid", "amount_paid" => 2500,
      "total" => 2500, "amount_remaining" => 0, "currency" => "usd", "billing_reason" => reason,
      "parent" => { "subscription_details" => { "subscription" => "sub_membership" } },
      "lines" => { "data" => [{ "amount" => 2500,
        "parent" => { "subscription_item_details" => { "proration" => false, "subscription" => "sub_membership" } },
        "period" => { "start" => start_at.to_i, "end" => end_at.to_i }
      }], "has_more" => false },
      "status_transitions" => { "paid_at" => paid_at.to_i }, "test_payment_id" => payment_id
    }.except("test_payment_id")
  end

  def with_recurring_clock(time)
    singleton = Clinic::Billing::StripeGateway.singleton_class
    original = Clinic::Billing::StripeGateway.method(:new)
    # A missing injection must fail before a provider adapter can be constructed.
    singleton.define_method(:new) { raise "Use the closed-world renewal gateway" }
    Current.set(business_date: time.to_date) { travel_to(time) { yield } }
  ensure
    singleton.define_method(:new, original)
  end

  def initial_paid_cycle
    with_recurring_clock(Time.utc(2026, 1, 15, 12)) do
      gateway = begin_checkout
      initial = paid_invoice(id: "in_initial", payment_id: "pi_initial", reason: "subscription_create",
        start_at: Time.current, paid_at: Time.current)
      gateway.attach_subscription(invoice: initial)
      gateway.add_invoice(initial, payment_id: "pi_initial")
      deliver_invoice(gateway, id: "evt_initial_paid", invoice_id: "in_initial")
      assert_equal 1, Clinic::Billing::StripeMembershipCycle.where(checkout: stripe_checkout).count
      assert_equal 1, @agreement.events.where(kind: "active").count
      gateway
    end
  end

  def recurring_ledger_snapshot(practices: [@practice])
    {
      invoices: Clinic::Invoice.where(practice: practices).order(:id).map do |invoice|
        [invoice.id, invoice.patient_id, invoice.status, invoice.currency,
          invoice.lines.order(:id).pluck(:id, :quantity, :unit_amount, :posted_amount)]
      end,
      payments: Clinic::PaymentEvent.where(practice: practices).order(:id)
        .pluck(:id, :patient_id, :amount, :currency, :external_event_reference),
      allocations: Clinic::PaymentAllocation.where(practice: practices).order(:id)
        .pluck(:id, :invoice_id, :payment_event_id, :patient_id, :amount),
      cycles: Clinic::Billing::StripeMembershipCycle.where(practice: practices).order(:id)
        .pluck(:id, :invoice_id, :provider_invoice_id, :provider_payment_id, :period_start, :period_end),
      receipts: Clinic::BillingReceipt.where(practice: practices).order(:id)
        .pluck(:id, :invoice_id, :payment_event_id, :kind, :issued_at, :payload),
      activations: Clinic::Care::SubscriptionEvent.where(practice: practices, kind: "active").order(:id)
        .pluck(:id, :agreement_id, :request_key, :details)
    }
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
