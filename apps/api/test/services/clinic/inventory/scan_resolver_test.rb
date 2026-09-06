require "test_helper"

class Clinic::Inventory::ScanResolverTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "scan-resolver@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Scan resolver fixture clinic")
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "inventory.transfer")
    @product = @practice.pharmacy_products.create!(
      name: "Scan resolver item", sku: "SCAN-EXACT-001", ndc: "12345-6789-01",
      stock_unit: "each", quantity_scale: 0, package_size: 1
    )
    other_practice = Clinic::Practice.create!(name: "Other scan resolver fixture clinic")
    other_practice.pharmacy_products.create!(
      name: "Other clinic item", sku: @product.sku,
      stock_unit: "each", quantity_scale: 0, package_size: 1
    )
  end

  test "exact local transfer scan resolves without changing inventory" do
    assert_no_difference [ "Clinic::Inventory::PharmacyBatch.count", "Clinic::Inventory::Entry.count" ] do
      result = Clinic::Inventory::ScanResolver.call(
        practice: @practice, actor: @actor, context: "transfer", scan_code: "SCAN-EXACT-001"
      )

      assert_equal "matched", result[:status]
      assert_equal [ @product.id.to_s ], result[:matches].pluck(:product_id)
      assert_equal [ "sku" ], result[:matches].sole[:matched_fields]
    end
  end
end
