require "test_helper"

class GuidedClinicDemoPermissionsTest < ActiveSupport::TestCase
  test "prepared guided demo operator has the supplier pricing role" do
    clinic = Development::GuidedClinicDemo.create_clinic!(
      clinic_name: "Guided supplier role clinic",
      operator_email: "guided-demo-supplier-role@example.test"
    )
    assert_empty clinic.practice.sites
    assert_empty clinic.practice.patients
    assert_empty clinic.practice.items
    assert_empty clinic.practice.staff_members

    Development::GuidedClinicDemo.prepare_clinic!(
      practice: clinic.practice,
      operator: clinic.operator,
      template_key: "primary_care",
      suffix: "supplier-role"
    )

    assert_equal 1, clinic.practice.sites.count
    assert_empty clinic.practice.patients
    assert clinic.practice.pharmacy_products.exists?

    ability = Ability.new(clinic.operator, practice: clinic.practice)
    assert ability.role_code_allowed?(Ability::SUPPLIER_PRICING_ROLE_CODES)
    assert ability.allowed_permission?("inventory.catalog")
  end
end
