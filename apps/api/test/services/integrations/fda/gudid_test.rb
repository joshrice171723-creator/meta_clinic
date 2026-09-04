require "test_helper"
require_relative "../../../support/pharmacy_method_override"

class Integrations::Fda::GudidTest < ActiveSupport::TestCase
  include PharmacyMethodOverride

  def fixture
    {
      "gudid" => {
        "device" => {
          "identifiers" => { "identifier" => [ { "deviceId" => "00812345000123", "deviceIdType" => "Primary", "deviceIdIssuingAgency" => "GS1" } ] },
          "brandName" => "Exam Gloves",
          "companyName" => "Example Medical",
          "versionModelNumber" => "NITRILE-M",
          "catalogNumber" => "GLV-M",
          "deviceDescription" => "Nitrile examination gloves, medium",
          "singleUse" => true,
          "lotBatch" => true,
          "expirationDate" => false,
          "gmdnTerms" => { "gmdn" => [ { "gmdnPTName" => "Non-sterile examination glove" } ] },
          "sterilization" => { "deviceSterile" => false }
        }
      }
    }
  end

  test "looks up a device identifier and maps the public device record" do
    captured = nil
    with_method(Integrations::Fda::Gudid, :fetch, ->(uri) { captured = uri; fixture }) do
      result = Integrations::Fda::Gudid.lookup("00812345000123")
      assert_equal "di", URI.decode_www_form(captured.query).to_h.keys.sole
      assert_equal "00812345000123", result[:device_identifier]
      assert_equal "GS1", result[:issuing_agency]
      assert_equal "Example Medical", result[:company_name]
      assert_equal "Non-sterile examination glove", result[:gmdn_name]
    end
  end

  test "uses the UDI parameter for a scanned UDI and rejects unsafe input" do
    captured = nil
    with_method(Integrations::Fda::Gudid, :fetch, ->(uri) { captured = uri; fixture }) do
      Integrations::Fda::Gudid.lookup("(01)00812345000123(10)LOT-1")
    end
    assert_equal "udi", URI.decode_www_form(captured.query).to_h.keys.sole
    with_method(Integrations::Fda::Gudid, :fetch, ->(*) { flunk "Invalid identifier reached the network" }) do
      assert_raises(ArgumentError) { Integrations::Fda::Gudid.lookup("<script>") }
    end
  end

  test "a missing device record remains a manual-entry path" do
    with_method(Integrations::Fda::Gudid, :fetch, nil) do
      assert_nil Integrations::Fda::Gudid.lookup("00812345000123")
    end
  end
end
