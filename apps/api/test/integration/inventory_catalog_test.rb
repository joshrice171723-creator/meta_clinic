require "test_helper"

class InventoryCatalogTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(24)
    @actor = User.create!(email_address: "catalog-query-fixture@example.invalid", password: password)
    @practice = Clinic::Practice.create!(name: "Catalog query fixture")
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "inventory.read", "inventory.receive", "inventory.hold", "inventory.release", "inventory.catalog")
    @product = @practice.pharmacy_products.create!(name: "Zulu liquid 100%", sku: "CATALOG", stock_unit: "mL", quantity_scale: 3, package_size: "1.25", unit_reference: "Fixture package")
    @receipt = Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, reason: "Catalog opening", request_key: SecureRandom.uuid, supplier: "Latest fixture supplier",
      lines: [ { product_id: @product.id, lot_number: "NEEDLE-LOT", location: "Needle shelf", expires_on: "2099-01-01", amount: "2", input_unit: "package" } ])
    get "/api/csrf", headers: @headers
    post "/api/session", params: { email_address: @actor.email_address, password: password },
      headers: @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token")), as: :json
    assert_response :success
  end

  test "bounds product records and searches the complete catalog with stable sorting" do
    44.times { |index| @practice.pharmacy_products.create!(name: "Catalog fixture #{index.to_s.rjust(2, '0')}", sku: "CATALOG-#{index}") }
    classes = Hash.new(0)
    subscriber = ->(_name, _start, _finish, _id, payload) { classes[payload[:class_name]] += payload[:record_count] }
    ActiveSupport::Notifications.subscribed(subscriber, "instantiation.active_record") { read_page }
    first = response.parsed_body.fetch("data")
    assert_equal 45, first.dig("catalog_page", "total_count")
    assert_equal 20, first.fetch("products").length
    assert_operator classes["Clinic::Inventory::PharmacyProduct"], :<=, 20
    %w[PharmacyBatch PharmacyMovement Receipt SupplierProduct PurchaseOrder].each { |name| assert_equal 0, classes["Clinic::Inventory::#{name}"] }
    %w[lots balances movements supplier_products purchase_orders receipts recalls audit_events].each { |key| assert_not first.key?(key) }
    ids = first.fetch("products").pluck("id")
    [ 2, 3 ].each do |page|
      read_page(page: page)
      ids.concat(response.parsed_body.dig("data", "products").pluck("id"))
    end
    assert_equal @practice.pharmacy_products.order(:name, :id).pluck(:id).map(&:to_s), ids
    assert_equal 45, ids.uniq.length
    [ "zulu", "needle-lot", "needle shelf", "Latest fixture supplier", "pkg_#{@product.id}", "%" ].each do |query|
      read_page(q: query)
      assert_equal [ @product.id.to_s ], response.parsed_body.dig("data", "products").pluck("id"), query
      assert_equal 1, response.parsed_body.dig("data", "catalog_page", "filtered_count")
    end
    read_page(status: "in_range", sort: "available_desc")
    assert_equal [ @product.id.to_s ], response.parsed_body.dig("data", "products").pluck("id")
    read_page(status: "attention", sort: "available_asc")
    assert_equal 44, response.parsed_body.dig("data", "catalog_page", "filtered_count")
    read_page(q: "no matches", page: 999)
    assert_empty response.parsed_body.dig("data", "products")
    assert_equal 1, response.parsed_body.dig("data", "catalog_page", "page")
  end

  test "preserves exact stock and supplier projection while counting held lots" do
    read_page
    item = response.parsed_body.dig("data", "products").sole
    assert_equal "2.5", item.fetch("available_units")
    assert_equal "2.5", item.fetch("on_hand_units")
    assert_equal "Latest fixture supplier", item.fetch("preferred_supplier")
    assert_equal false, response.parsed_body.dig("data", "can_create_purchase_order")
    @product.batches.sole.change_status!(status: "damaged", reason: "Fixture damage", actor: @actor, request_key: SecureRandom.uuid)
    read_page
    held = response.parsed_body.fetch("data")
    assert_equal "0.0", held.fetch("products").sole.fetch("available_units")
    assert_equal 1, held.fetch("attention_count")
    assert_equal "quarantined", held.fetch("attention").sole.fetch("status")
    assert_equal @product.name, held.fetch("attention").sole.fetch("product_name")
    get "/api/clinic/inventory/catalog", headers: @headers
    assert_response :success
    assert_equal response.parsed_body.dig("data", "products"), held.fetch("products"), "Legacy and table stock/supplier fields must agree"
    assert_not response.parsed_body.fetch("data").key?("catalog_page")
  end

  test "rejects malformed filters and rechecks tenant and permission" do
    [ { page: "-1" }, { page: "1.5" }, { page: "99999999999999999" }, { status: "unknown" }, { sort: "name; SELECT 1" }, { q: "a" * 101 } ].each do |params|
      get "/api/clinic/inventory/catalog", params: params.merge(view: "table"), headers: @headers
      assert_response :unprocessable_entity
    end
    other = Clinic::Practice.create!(name: "Other catalog fixture")
    read_page(practice_id: other.id)
    assert_equal @practice.id, response.parsed_body.dig("data", "practice", "id")
    assert_equal 0, Clinic::Inventory::CatalogQuery.table(practice: other).total_count
    set_permission!(@membership, "inventory.read", false)
    get "/api/clinic/inventory/catalog", params: { view: "table" }, headers: @headers
    assert_response :forbidden
  end

  test "stock eligibility, supplier precedence and bounded attention match existing rules" do
    preferred = @practice.inventory_suppliers.create!(name: "Preferred fixture supplier")
    @product.update_catalog!({ preferred_supplier_id: preferred.id }, actor: @actor)
    read_page(q: preferred.name)
    assert_equal preferred.id.to_s, response.parsed_body.dig("data", "products").sole.fetch("preferred_supplier_id")
    read_page(q: "Latest fixture supplier")
    assert_empty response.parsed_body.dig("data", "products")
    site = @practice.sites.create!(code: "CATALOG-FIXTURE", status: "active", address_line1: "Fixture address", city: "Fixture city", state: "TX", postal_code: "00000", country: "US")
    read_page
    assert_equal true, response.parsed_body.dig("data", "can_create_purchase_order")
    site.update!(city: " \t ")
    read_page
    assert_equal false, response.parsed_body.dig("data", "can_create_purchase_order")

    24.times do |index|
      Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, reason: "Held catalog fixture", request_key: SecureRandom.uuid,
        lines: [ { product_id: @product.id, lot_number: "HELD-#{index}", location: "Fixture shelf", expires_on: "2098-01-01", amount: "0.125", input_unit: "mL" } ])
    end
    @product.batches.each { |batch| batch.change_status!(status: "damaged", reason: "Fixture hold", actor: @actor, request_key: SecureRandom.uuid) }
    batch = @product.batches.find_by!(lot_number: "NEEDLE-LOT")
    batch.change_status!(status: "recalled", reason: "Fixture recall", actor: @actor, request_key: SecureRandom.uuid)
    read_page
    data = response.parsed_body.fetch("data")
    assert_equal 25, data.fetch("attention_count"), "Multiple holds on one lot must not duplicate it"
    assert_equal 20, data.fetch("attention").length
    assert_equal "5.5", data.fetch("products").sole.fetch("on_hand_units")
    assert_equal "0.0", data.fetch("products").sole.fetch("available_units")
    batch.active_holds.each { |hold| batch.change_status!(status: "active", hold_id: hold.id, reason: "Fixture release", actor: @actor, request_key: SecureRandom.uuid) }
    read_page
    assert_equal 24, response.parsed_body.dig("data", "attention_count")
    assert_equal "2.5", response.parsed_body.dig("data", "products").sole.fetch("available_units")
    @product.update_catalog!({ active: false }, actor: @actor)
    read_page
    assert_equal "0.0", response.parsed_body.dig("data", "products").sole.fetch("available_units")
    @product.update_catalog!({ active: true }, actor: @actor)
    travel_to Time.utc(2100, 1, 1) do
      table = Clinic::Inventory::InventoryWire.catalog(practice: @practice, actor: @actor)
      assert_equal "0.0", table.fetch(:products).sole.fetch(:available_units), "Expired stock must be unavailable"
    end
  end

  private

  def read_page(**params)
    get "/api/clinic/inventory/catalog", params: params.merge(view: "table"), headers: @headers
    assert_response :success
  end
end
