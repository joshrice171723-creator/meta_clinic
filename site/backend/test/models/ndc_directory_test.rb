require "test_helper"
require_relative "../support/pharmacy_method_override"

class NdcDirectoryTest < ActiveSupport::TestCase
  include PharmacyMethodOverride
  def fixture
    { "results" => [ { "brand_name" => "Fictional API medicine", "product_ndc" => "1234-5678", "generic_name" => "Example", "route" => [ "ORAL" ], "active_ingredients" => [ { "name" => "Example ingredient", "strength" => "1 test unit" } ], "packaging" => [ { "package_ndc" => "1234-5678-10", "description" => "10 fictional packages" }, { "package_ndc" => "1234-5678-20", "description" => "20 fictional packages" } ] } ] }
  end

  test "search maps every package and an exact NDC selects its own description" do
    with_method(Pharmacy::NdcDirectory, :fetch, fixture) do
      results = Pharmacy::NdcDirectory.search("Example")
      assert_equal 2, results.length
      assert_equal "20 fictional packages", Pharmacy::NdcDirectory.search("1234-5678-20").sole[:package_description]
      assert_equal "Example ingredient 1 test unit", results.first[:ingredients]
      assert_equal 2, Pharmacy::NdcDirectory.search("1234-5678").length
      assert_equal "1234-5678-20", Pharmacy::NdcDirectory.search("1234567820").sole[:ndc]
    end
  end

  test "outbound lookup uses the packaging field and a fixed FDA host" do
    captured = nil
    with_method(Pharmacy::NdcDirectory, :fetch, ->(uri) { captured = uri; fixture }) { Pharmacy::NdcDirectory.search("1234-5678-20") }
    assert_equal "api.fda.gov", captured.host
    assert_equal "https", captured.scheme
    search = URI.decode_www_form(captured.query).to_h.fetch("search")
    assert_includes search, 'packaging.package_ndc:"1234-5678-20"'
    assert_not_includes search, "api_key"
  end

  test "malformed queries never reach the network and missing packaging is safe" do
    [ "a", 'example" OR *', "https://example.invalid", "123", "a" * 81 ].each do |query|
      with_method(Pharmacy::NdcDirectory, :fetch, ->(*) { flunk "Invalid query reached the network" }) do
        assert_raises(ArgumentError) { Pharmacy::NdcDirectory.search(query) }
      end
    end
    with_method(Pharmacy::NdcDirectory, :fetch, { "results" => [ nil, { "packaging" => nil } ] }) do
      assert_empty Pharmacy::NdcDirectory.search("Example")
    end
    with_method(Pharmacy::NdcDirectory, :fetch, nil) do
      assert_raises(Pharmacy::NdcDirectory::Unavailable) { Pharmacy::NdcDirectory.search("Example") }
    end
  end
end
