require "test_helper"

class StripeGatewayTest < ActiveSupport::TestCase
  test "uses the supported Stripe application programming interface version" do
    assert_equal "2026-07-29.dahlia", Clinic::Billing::StripeGateway::API_VERSION
  end
end
