require "test_helper"

class ClinicianSerializerTest < ActiveSupport::TestCase
  test "booking projection includes display name without requiring workforce details" do
    profile = Clinic::ClinicianProfile.new(id: 42, membership_id: 24, display_name: "Avery Morgan", reference: "AM")
    result = Clinic::ClinicianSerializer.call(profile)
    assert_equal "Avery Morgan", result[:display_name]
    assert_equal 42, result[:id]
    assert_not result.key?(:credentials)
  end
end
