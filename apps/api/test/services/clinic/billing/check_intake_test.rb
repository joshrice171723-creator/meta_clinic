require "minitest/autorun"
require_relative "../../../../app/services/clinic/billing/money"
require_relative "../../../../app/services/clinic/billing/check_intake"

class ClinicBillingCheckIntakeTest < Minitest::Test
  class SyntheticAdapter
    class << self
      attr_reader :received
    end

    def self.scan(metadata:)
      @received = metadata
      {
        "status" => "synthetic-needs-review",
        "fields" => {
          "check_number" => "SYN-CHECK-001",
          "image_data" => "synthetic-image-must-not-escape"
        }
      }
    end
  end

  def setup
    SyntheticAdapter.instance_variable_set(:@received, nil)
  end

  def test_validates_synthetic_metadata_and_returns_only_redacted_adapter_evidence
    result = Clinic::Billing::CheckIntake.call(
      metadata: {
        amount: "125.00",
        currency: "usd",
        check_number: "SYN-CHECK-001",
        provider_reference: "synthetic-provider-reference"
      },
      adapter: SyntheticAdapter
    )

    assert_equal "synthetic-needs-review", result.status
    assert_equal({ "amount" => "125.0", "currency" => "USD", "has_check_number" => true,
                   "has_provider_reference" => true }, result.metadata)
    assert_equal({ "status" => "synthetic-needs-review", "fields_present" => %w[check_number image_data] }, result.redacted_response)
    assert_equal "SYN-CHECK-001", SyntheticAdapter.received["check_number"]
    refute_includes result.redacted_response.to_s, "synthetic-image-must-not-escape"
  end

  def test_default_adapter_fails_closed_until_a_provider_and_policy_are_authorized
    error = assert_raises(Clinic::Billing::CheckOcrAdapter::NotAuthorized) do
      Clinic::Billing::CheckIntake.call(metadata: { amount: "1.00", currency: "USD" })
    end

    assert_includes error.message, "not authorized"
  end

  def test_rejects_image_material_unknown_fields_and_invalid_monetary_metadata
    [
      { image_data: "synthetic-image" },
      { object_key: "synthetic-object-key" },
      { account_number: "synthetic-account" },
      { amount: "0", currency: "USD" },
      { amount: "1.00", currency: "US" },
      { amount: "1.00", currency: "USD", check_number: "x" * 65 }
    ].each do |metadata|
      assert_raises(ArgumentError) { Clinic::Billing::CheckIntake.validate_metadata!(metadata) }
    end
  end

  def test_does_not_require_unapproved_provider_specific_fields
    metadata = Clinic::Billing::CheckIntake.validate_metadata!(amount: "10.50", currency: "USD")

    assert_equal({ "amount" => "10.5", "currency" => "USD" }, metadata)
  end
end
