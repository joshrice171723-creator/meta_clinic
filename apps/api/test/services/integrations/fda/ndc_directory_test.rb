require "test_helper"
require_relative "../../../support/pharmacy_method_override"

class Integrations::Fda::NdcDirectoryTest < ActiveSupport::TestCase
  include PharmacyMethodOverride
  def fixture
    { "results" => [ { "brand_name" => "Fictional API medicine", "product_ndc" => "1234-5678", "generic_name" => "Example", "route" => [ "ORAL" ], "active_ingredients" => [ { "name" => "Example ingredient", "strength" => "1 test unit" } ], "packaging" => [ { "package_ndc" => "1234-5678-10", "description" => "10 fictional packages" }, { "package_ndc" => "1234-5678-20", "description" => "20 fictional packages" } ] } ] }
  end

  test "search maps every package and an exact NDC selects its own description" do
    with_method(Integrations::Fda::NdcDirectory, :fetch, fixture) do
      results = Integrations::Fda::NdcDirectory.search("Example")
      assert_equal 2, results.length
      assert_equal "20 fictional packages", Integrations::Fda::NdcDirectory.search("1234-5678-20").sole[:package_description]
      assert_equal "Example ingredient 1 test unit", results.first[:ingredients]
      assert_equal 2, Integrations::Fda::NdcDirectory.search("1234-5678").length
      assert_equal "1234-5678-20", Integrations::Fda::NdcDirectory.search("1234567820").sole[:ndc]
    end
  end

  test "outbound lookup uses the packaging field and a fixed FDA host" do
    captured = nil
    with_method(Integrations::Fda::NdcDirectory, :fetch, ->(uri) { captured = uri; fixture }) { Integrations::Fda::NdcDirectory.search("1234-5678-20") }
    assert_equal "api.fda.gov", captured.host
    assert_equal "https", captured.scheme
    search = URI.decode_www_form(captured.query).to_h.fetch("search")
    assert_includes search, 'packaging.package_ndc:"1234-5678-20"'
    assert_not_includes search, "api_key"
  end

  test "short medication fragments use FDA wildcard search" do
    captured = nil
    with_method(Integrations::Fda::NdcDirectory, :fetch, ->(uri) { captured = uri; fixture }) { Integrations::Fda::NdcDirectory.search("Exa") }
    search = URI.decode_www_form(captured.query).to_h.fetch("search")
    assert_includes search, "brand_name:Exa*"
    assert_includes search, "generic_name:Exa*"
  end

  test "malformed queries never reach the network and missing packaging is safe" do
    [ "a", 'example" OR *', "https://example.invalid", "123", "a" * 81 ].each do |query|
      with_method(Integrations::Fda::NdcDirectory, :fetch, ->(*) { flunk "Invalid query reached the network" }) do
        assert_raises(ArgumentError) { Integrations::Fda::NdcDirectory.search(query) }
      end
    end
    with_method(Integrations::Fda::NdcDirectory, :fetch, { "results" => [ nil, { "packaging" => nil } ] }) do
      assert_empty Integrations::Fda::NdcDirectory.search("Example")
    end
    with_method(Integrations::Fda::NdcDirectory, :fetch, nil) do
      assert_raises(Integrations::Fda::NdcDirectory::Unavailable) { Integrations::Fda::NdcDirectory.search("Example") }
    end
  end
end
