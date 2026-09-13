require "test_helper"

class StripeGatewayTest < ActiveSupport::TestCase
  test "uses the supported Stripe application programming interface version" do
    assert_equal "2026-07-29.dahlia", Clinic::Billing::StripeGateway::API_VERSION
  end

  test "accepts current temporary sandbox restricted keys but never live keys" do
    assert_match Clinic::Billing::StripeGateway::SANDBOX_KEY_PATTERN, "rkcs_test_synthetic123"
    assert_no_match Clinic::Billing::StripeGateway::SANDBOX_KEY_PATTERN, "rk_live_synthetic123"
  end
end
