require "test_helper"
require_relative "../../../support/pharmacy_method_override"

class Clinic::Inventory::NdcCatalogTest < ActiveSupport::TestCase
  include PharmacyMethodOverride

  setup do
    @user = User.create!(email_address: "catalog-operation@example.invalid", password: SecureRandom.hex(20))
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @catalog = Clinic::Inventory::NdcCatalog.new(practice: @practice, actor: @user)
    @record = { name: "Fictional reference", ndc: "1234-0000-01", package_description: "Synthetic package" }
  end

  def reference
    with_method(Integrations::Fda::NdcDirectory, :search, [ @record ]) { @catalog.search("fictional").sole.last }
  end

  test "reference import is account-bound metadata only and rechecks current permissions" do
    token = reference
    assert_no_difference "Clinic::Inventory::Entry.count" do
      assert_difference "Clinic::Inventory::PharmacyProduct.count", 1 do
        first = @catalog.import(token)
        assert_equal first, @catalog.import(token)
        assert_equal "openfda", first.source
        assert_equal 0, first.on_hand_quantity
      end
    end
    @membership.update!(inventory_catalog: false)
    assert_raises(ArgumentError) { @catalog.import(token) }
    with_method(Integrations::Fda::NdcDirectory, :search, ->(*) { flunk "Denied search reached the network" }) do
      assert_raises(ArgumentError) { @catalog.search("fictional") }
    end
  end

  test "another account cannot reuse a result even at the same clinic and expired results stay invalid" do
    token = reference
    other = User.create!(email_address: "catalog-other@example.invalid", password: SecureRandom.hex(20))
    Clinic::Membership.create!(practice: @practice, user: other, inventory_access: true, inventory_catalog: true)
    catalog = Clinic::Inventory::NdcCatalog.new(practice: @practice, actor: other)
    assert_no_difference "Clinic::Inventory::PharmacyProduct.count" do
      assert_raises(ArgumentError) { catalog.import(token) }
      assert_raises(ArgumentError) { @catalog.import(token + "tampered") }
      travel 21.minutes do
        assert_raises(ArgumentError) { @catalog.import(token) }
      end
    end
  end
end
