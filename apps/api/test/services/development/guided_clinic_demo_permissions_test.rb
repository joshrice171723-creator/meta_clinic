require "test_helper"

class GuidedClinicDemoPermissionsTest < ActiveSupport::TestCase
  test "prepared guided demo operator has the supplier pricing role" do
    clinic = Development::GuidedClinicDemo.create_clinic!(
      clinic_name: "Guided supplier role clinic",
      operator_email: "guided-demo-supplier-role@example.test"
    )

    Development::GuidedClinicDemo.prepare_clinic!(
      practice: clinic.practice,
      operator: clinic.operator,
      template_key: "primary_care",
      suffix: "supplier-role"
    )

    ability = Ability.new(clinic.operator, practice: clinic.practice)
    assert ability.role_code_allowed?(Ability::SUPPLIER_PRICING_ROLE_CODES)
    assert ability.allowed_permission?("inventory.catalog")
  end
end
