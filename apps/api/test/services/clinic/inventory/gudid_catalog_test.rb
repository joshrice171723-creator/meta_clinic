require "test_helper"
require_relative "../../../support/pharmacy_method_override"

class Clinic::Inventory::GudidCatalogTest < ActiveSupport::TestCase
  include PharmacyMethodOverride

  setup do
    @user = User.create!(email_address: "device-catalog@example.invalid", password: SecureRandom.hex(20))
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @catalog = Clinic::Inventory::GudidCatalog.new(practice: @practice, actor: @user)
    @record = { device_identifier: "00812345000123", brand_name: "Exam Gloves", company_name: "Example Medical", device_description: "Nitrile examination gloves, medium", source_url: "https://accessgudid.nlm.nih.gov/devices/00812345000123" }
  end

  test "imports a signed device result with clinic-owned purchasing fields" do
    token = with_method(Integrations::Fda::Gudid, :lookup, @record) { @catalog.lookup(@record[:device_identifier]).last }
    product = @catalog.import(token, operational_attributes: { name: "Nitrile exam gloves - medium", category: "clinical_supply", sku: "GLOVE-NITRILE-M", stock_unit: "each", package_size: 1, quantity_scale: 0, reorder_point: 10, unit_reference: "each" })
    assert_equal "gudid", product.source
    assert_equal @record[:device_identifier], product.device_identifier
    assert_equal "Nitrile exam gloves - medium", product.name
    assert_equal "clinical_supply", product.category
    assert_equal 0, product.on_hand_quantity
  end
end
