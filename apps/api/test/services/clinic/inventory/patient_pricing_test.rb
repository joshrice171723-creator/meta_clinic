require "test_helper"

class Clinic::Inventory::PatientPricingTest < ActiveSupport::TestCase
  test "adds markup and dispensing fee to supplier cost" do
    assert_equal BigDecimal("135.00"), Clinic::Inventory::PatientPricing.calculate(
      wholesale_unit_cost: "100.00",
      markup_percent: "25",
      dispensing_fee: "10",
    )
  end

  test "rejects negative or excessive markup inputs" do
    assert_raises(ArgumentError) do
      Clinic::Inventory::PatientPricing.calculate(wholesale_unit_cost: "10", markup_percent: "-1", dispensing_fee: "0")
    end
    assert_raises(ArgumentError) do
      Clinic::Inventory::PatientPricing.calculate(wholesale_unit_cost: "10", markup_percent: "1001", dispensing_fee: "0")
    end
  end
end
