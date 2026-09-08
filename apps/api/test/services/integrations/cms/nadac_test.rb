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
          "identifier" => "old-dataset",
          "modified" => "2025-12-31T00:00:00Z",
          "distribution" => [ { "format" => "csv", "downloadURL" => "https://download.medicaid.gov/data/old.csv" } ]
        },
        {
          "title" => "NADAC (National Average Drug Acquisition Cost) 2026",
          "identifier" => "current-dataset",
          "modified" => "2026-09-02T00:00:00Z",
          "distribution" => [ { "format" => "csv", "downloadURL" => "https://download.medicaid.gov/data/current.csv" } ]
        }
      ]
    }
    response = {
      "results" => [
        {
          "ndc" => "51655047451",
          "ndc_description" => "IBUPROFEN 40 TABLET",
          "nadac_per_unit" => "0.12345",
          "effective_date" => "2026-09-02",
          "pricing_unit" => "EA"
        }
      ]
    }.to_json
    calls = []
    with_method(Integrations::Cms::Nadac, :fetch, lambda { |uri, accept, options = {}|
      body = options[:body]
      calls << [ uri.to_s, accept, body ]
      body ? response : metadata.to_json
    }) do
      Integrations::Cms::Nadac.reset_cache!
      benchmark = Integrations::Cms::Nadac.lookup("51655-474-51")
      assert_equal "51655047451", benchmark[:ndc]
      assert_equal "0.12345", benchmark[:nadac_per_unit]
      assert_equal "EA", benchmark[:pricing_unit]
      assert_equal "https://download.medicaid.gov/data/current.csv", benchmark[:source_url]
    end
    assert_equal [ "https://data.medicaid.gov/data.json", "application/json", nil ], calls.first
    assert_equal "https://data.medicaid.gov/api/1/datastore/query/current-dataset/0", calls.second.first
    assert_equal "application/json", calls.second.second
    assert_equal({
      "conditions" => [ { "property" => "ndc", "value" => "51655047451", "operator" => "=" } ],
      "limit" => 1
    }, JSON.parse(calls.second.third))
  end
end
