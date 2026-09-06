require "test_helper"

class StripeConnectTest < ActiveSupport::TestCase
  setup do
    @environment = ENV.to_h.slice("STRIPE_SANDBOX_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET", "STRIPE_RETURN_ORIGIN")
    ENV["STRIPE_SANDBOX_KEY"] = "rk_test_fixture"
    ENV["STRIPE_CONNECT_WEBHOOK_SECRET"] = "whsec_fixture"
    ENV["STRIPE_RETURN_ORIGIN"] = "http://127.0.0.1:3200"
    @practice = Clinic::Practice.create!(name: "Connect Test Clinic")
    @actor = User.create!(email_address: "connect-owner@example.invalid", password: SecureRandom.hex(20))
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "subscription_catalog.publish", "billing.payment_record", "billing.read")
  end

  teardown do
    %w[STRIPE_SANDBOX_KEY STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_RETURN_ORIGIN].each do |key|
      @environment.key?(key) ? ENV[key] = @environment[key] : ENV.delete(key)
    end
  end

  class Gateway
    attr_reader :calls
    def initialize
      @calls = []
    end

    def request(method, path, **options)
      @calls << [method, path, options]
      if path == "/v2/core/accounts"
        @reference = options.fetch(:fields).fetch("metadata").fetch("apply_connection")
        { "id" => "acct_fixture" }
      elsif path == "/v2/core/account_links"
        { "url" => "https://connect.stripe.com/setup/fixture" }
      else
        { "id" => "acct_fixture", "metadata" => { "apply_connection" => @reference },
          "livemode" => false, "dashboard" => "full",
          "defaults" => { "responsibilities" => { "fees_collector" => "stripe", "losses_collector" => "stripe" } },
          "configuration" => { "merchant" => { "capabilities" => {
            "card_payments" => { "status" => "active" }, "stripe_balance" => { "payouts" => { "status" => "active" } }
          } } } }
      end
    end
  end

  test "onboarding binds one clinic account and keeps clinic-paid fees across retries" do
    gateway = Gateway.new
    2.times do
      assert_equal "https://connect.stripe.com/setup/fixture", Clinic::Billing::StripeConnect.onboard(practice: @practice, actor: @actor, gateway: gateway)
    end
    creates = gateway.calls.select { |_, path, _| path == "/v2/core/accounts" }
    assert_equal 1, creates.length
    assert_equal "stripe", creates.first.last[:fields].dig("defaults", "responsibilities", "fees_collector")
    assert_equal "stripe", creates.first.last[:fields].dig("defaults", "responsibilities", "losses_collector")
    assert_equal 1, Clinic::Billing::StripeConnection.where(practice: @practice).count
    status = Clinic::Billing::StripeConnect.refresh(practice: @practice, actor: @actor, gateway: gateway)
    assert status[:charges_enabled]
    assert status[:payouts_enabled]
    assert_equal "2.1", status[:application_fee_percent]
    assert_equal "test", status[:mode]
  end

  test "unauthorized and foreign-practice actors cannot onboard" do
    other = Clinic::Practice.create!(name: "Other Test Clinic")
    assert_raises(Clinic::Authorization::Denied) { Clinic::Billing::StripeConnect.onboard(practice: other, actor: @actor, gateway: Gateway.new) }
    revoke_all_permissions!(@membership)
    assert_raises(Clinic::Authorization::Denied) { Clinic::Billing::StripeConnect.onboard(practice: @practice, actor: @actor, gateway: Gateway.new) }
    assert_equal 0, Clinic::Billing::StripeConnection.count
  end

  test "live keys and unsafe redirects fail closed" do
    ENV["STRIPE_SANDBOX_KEY"] = "sk_live_fixture"
    assert_not Clinic::Billing::StripeGateway.configured?
    assert_raises(Clinic::Billing::StripeGateway::Unavailable) { Clinic::Billing::StripeConnect.onboard(practice: @practice, actor: @actor, gateway: Gateway.new) }
    ["https://checkout.stripe.com.evil.invalid/pay", "https://user@checkout.stripe.com/pay", "http://checkout.stripe.com/pay"].each do |url|
      assert_raises(Clinic::Billing::StripeGateway::Invalid) { Clinic::Billing::StripeGateway.external_url(url, host: "checkout.stripe.com") }
    end
    ENV["STRIPE_RETURN_ORIGIN"] = "http://untrusted.invalid"
    assert_raises(Clinic::Billing::StripeGateway::Invalid) { Clinic::Billing::StripeGateway.return_url("/patient-portal") }
  end

  test "routing cannot be repointed or deleted through SQL" do
    Clinic::Billing::StripeConnect.onboard(practice: @practice, actor: @actor, gateway: Gateway.new)
    record = Clinic::Billing::StripeConnect.connection(@practice)
    assert_raises(ActiveRecord::StatementInvalid) do
      record.class.transaction(requires_new: true) { record.update_columns(account_id: "acct_different") }
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      record.class.transaction(requires_new: true) { record.delete }
    end
  end

  test "fee uses exact cents and half-up rounding" do
    assert_equal 210, Clinic::Billing::StripeMembershipPayments.fee_cents("100.00")
    assert_equal 158, Clinic::Billing::StripeMembershipPayments.fee_cents("75.25")
    assert_equal 11, Clinic::Billing::StripeMembershipPayments.fee_cents("5.00")
    assert_raises(ArgumentError) { Clinic::Billing::StripeMembershipPayments.fee_cents("1.001") }
  end
end
