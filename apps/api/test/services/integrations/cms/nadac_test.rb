require "test_helper"
require_relative "../../../support/pharmacy_method_override"

class Integrations::Cms::NadacTest < ActiveSupport::TestCase
  include PharmacyMethodOverride

  test "normalizes FDA package NDCs to the NADAC eleven digit form" do
    assert_equal "51655047451", Integrations::Cms::Nadac.normalize_ndc("51655-474-51")
    assert_equal "12345067890", Integrations::Cms::Nadac.normalize_ndc("12345-678-90")
    assert_equal "12345678901", Integrations::Cms::Nadac.normalize_ndc("12345-6789-01")
    assert_nil Integrations::Cms::Nadac.normalize_ndc("1234567890")
  end

  test "selects the newest public dataset and returns the exact NDC benchmark" do
    metadata = {
      "dataset" => [
        {
          "title" => "NADAC (National Average Drug Acquisition Cost) 2025",
          "modified" => "2025-12-31T00:00:00Z",
          "distribution" => [ { "format" => "csv", "downloadURL" => "https://download.medicaid.gov/data/old.csv" } ]
        },
        {
          "title" => "NADAC (National Average Drug Acquisition Cost) 2026",
          "modified" => "2026-09-02T00:00:00Z",
          "distribution" => [ { "format" => "csv", "downloadURL" => "https://download.medicaid.gov/data/current.csv" } ]
        }
      ]
    }
    csv = <<~CSV
      NDC,NDC Description,NADAC Per Unit,Effective Date,Pricing Unit
      51655047451,IBUPROFEN 40 TABLET,0.12345,2026-09-02,EA
    CSV
    calls = []
    with_method(Integrations::Cms::Nadac, :fetch, lambda { |uri, accept|
      calls << [ uri.to_s, accept ]
      accept == "application/json" ? metadata.to_json : csv
    }) do
      Integrations::Cms::Nadac.reset_cache!
      benchmark = Integrations::Cms::Nadac.lookup("51655-474-51")
      assert_equal "51655047451", benchmark[:ndc]
      assert_equal "0.12345", benchmark[:nadac_per_unit]
      assert_equal "EA", benchmark[:pricing_unit]
      assert_equal "https://download.medicaid.gov/data/current.csv", benchmark[:source_url]
    end
    assert_equal [ "https://data.medicaid.gov/data.json", "application/json" ], calls.first
    assert_equal [ "https://download.medicaid.gov/data/current.csv", "text/csv" ], calls.second
  end
end
