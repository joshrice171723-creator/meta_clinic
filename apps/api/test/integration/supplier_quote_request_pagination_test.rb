require "test_helper"

class SupplierQuoteRequestPaginationTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(18)
    @actor = User.create!(email_address: "quote-pages-#{SecureRandom.hex(5)}@example.invalid", password: password)
    @membership = Development::TestClinic.create!(@actor)
    @practice = @membership.practice
    role = RoleVersion.find_or_create_by!(role_code: "dev-seed-inventory", version: 1)
    %w[inventory.read inventory.catalog].each do |action|
      RoleVersionPermission.find_or_create_by!(role_version: role, permission: Permission.find_or_create_by!(action_code: action))
    end
    @pricing_grant = @membership.role_grants.create!(practice: @practice, role_version: role,
      scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)
    @offer = create_offer(@practice)
    get "/api/csrf", headers: @headers
    post "/api/session", params: { email_address: @actor.email_address, password: password },
      headers: @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token")), as: :json
    assert_response :success
  end

  test "request pages and status counts preserve tied order and recorded quantities" do
    timestamp = 1.minute.ago
    open = 26.times.map { create_request(@offer, created_at: timestamp) }
    quoted = 2.times.map { create_request(@offer, status: "quoted", created_at: timestamp) }
    @offer.update!(package_quantity: 99)

    data = read_requests(supplier_id: @offer.supplier_id, quote_request_status: "open")
    assert_equal open.last(25).reverse.map { |request| request.id.to_s }, data.fetch("quote_requests").pluck("id")
    assert_equal({ "status" => "open", "page" => 1, "page_count" => 2, "page_size" => 25,
      "total_count" => 28, "filtered_count" => 26 }, data.fetch("quote_request_page"))
    assert_equal true, data.fetch("quote_requests_capped")
    assert_equal 1, data.dig("supplier_page", "page")

    older = read_requests(supplier_id: @offer.supplier_id, quote_request_status: "open", quote_request_page: 2)
    row = older.fetch("quote_requests").sole
    assert_equal open.first.id.to_s, row.fetch("id")
    assert_equal "3.0", row.fetch("requested_packages")
    assert_equal "0.125", row.fetch("package_quantity_at_request")
    assert_equal "mL", row.fetch("stock_unit_at_request")
    assert_equal "99.0", older.fetch("supplier_products").sole.fetch("package_quantity")
    assert_equal 1, older.dig("supplier_page", "page")
    assert_equal 2, older.dig("quote_request_page", "page")

    filtered = read_requests(supplier_id: @offer.supplier_id, quote_request_status: "quoted", quote_request_page: 999999)
    assert_equal quoted.reverse.map { |request| request.id.to_s }, filtered.fetch("quote_requests").pluck("id")
    assert_equal 28, filtered.dig("quote_request_page", "total_count")
    assert_equal 2, filtered.dig("quote_request_page", "filtered_count")
    assert_equal 1, filtered.dig("quote_request_page", "page")
    assert_equal false, filtered.fetch("quote_requests_capped")
    all = read_requests(supplier_id: @offer.supplier_id)
    assert_equal (open + quoted).last(25).reverse.map { |request| request.id.to_s }, all.fetch("quote_requests").pluck("id")
    assert_equal 28, all.dig("quote_request_page", "filtered_count")
    assert_equal "3.0", open.first.reload.requested_packages.to_s("F")
    assert_equal "0.125", open.first.package_quantity_at_request.to_s("F")
    assert_equal "open", open.first.status
  end

  test "supplier and practice isolation remain enforced after pricing role revocation" do
    current = create_request(@offer)
    other_offer = create_offer(@practice)
    other = create_request(other_offer)
    foreign = Clinic::Practice.create!(name: "Synthetic foreign quote clinic")
    foreign_offer = create_offer(foreign)
    excluded = create_request(foreign_offer)

    data = read_requests
    assert_equal [ current.id, other.id ].sort.map(&:to_s), data.fetch("quote_requests").pluck("id").sort_by(&:to_i)
    assert_not_includes data.fetch("quote_requests").pluck("id"), excluded.id.to_s
    assert_equal [ current.id.to_s ], read_requests(supplier_id: @offer.supplier_id).fetch("quote_requests").pluck("id")
    assert_equal [ other.id.to_s ], read_requests(supplier_id: other_offer.supplier_id).fetch("quote_requests").pluck("id")
    get "/api/clinic/inventory/supplier-pricing", params: { supplier_id: foreign_offer.supplier_id }, headers: @headers
    assert_response :not_found
    assert_not response.parsed_body.key?("data")

    @pricing_grant.update!(revoked_at: Time.current, revision: @pricing_grant.revision + 1)
    assert_nothing_raised do
      Clinic::Authorization.authorize!(actor: @actor, practice: @practice, action: "inventory.read")
    end
    get "/api/clinic/inventory/supplier-pricing", params: { quote_request_page: 2 }, headers: @headers
    assert_response :forbidden
    assert_not response.parsed_body.key?("data")
    assert_equal "open", current.reload.status
  end

  test "empty filtered pages and invalid page or status inputs do not claim success" do
    create_request(@offer, status: "quoted")
    data = read_requests(supplier_id: @offer.supplier_id, quote_request_status: "open", quote_request_page: 2)
    assert_empty data.fetch("quote_requests")
    assert_equal({ "status" => "open", "page" => 1, "page_count" => 1, "page_size" => 25,
      "total_count" => 1, "filtered_count" => 0 }, data.fetch("quote_request_page"))
    [ { quote_request_page: 0 }, { quote_request_page: "invalid" }, { quote_request_page: "1.5" },
      { quote_request_page: 1000000 }, { quote_request_status: "sent" } ].each do |invalid|
      get "/api/clinic/inventory/supplier-pricing", params: invalid, headers: @headers
      assert_response :unprocessable_entity
      assert_not response.parsed_body.key?("data")
    end
  end

  private

  def read_requests(**params)
    get "/api/clinic/inventory/supplier-pricing", params:, headers: @headers
    assert_response :success
    response.parsed_body.fetch("data")
  end

  def create_offer(practice)
    supplier = practice.inventory_suppliers.create!(name: "Synthetic quote supplier #{SecureRandom.hex(3)}")
    product = practice.pharmacy_products.create!(name: "Synthetic liquid", sku: "QUOTE-#{SecureRandom.hex(5)}",
      ndc: "12345678901", stock_unit: "mL", quantity_scale: 3, package_size: 90, unit_reference: "90 mL bottle")
    supplier.supplier_products.create!(practice:, product:, ndc: product.ndc, supplier_sku: "SYN-QUOTE",
      description: "Synthetic liquid offer", ordering_unit: "package", currency: "USD", contract_status: "active",
      package_quantity: "0.125", wholesale_unit_cost: 12, available: true,
      effective_date: practice.inventory_date, imported_at: Time.current)
  end

  def create_request(offer, status: "open", created_at: Time.current)
    Clinic::Inventory::SupplierQuoteRequest.create!(practice: offer.practice, supplier_product: offer,
      supplier: offer.supplier, product: offer.product, requested_packages: 3,
      package_quantity_at_request: offer.package_quantity, stock_unit_at_request: offer.product.stock_unit,
      note: "Independently synthetic request", request_key: SecureRandom.uuid, status:, created_at:,
      quote_reference: status == "quoted" ? "SYN-QUOTE-1" : nil,
      quoted_on: status == "quoted" ? offer.practice.inventory_date : nil)
  end
end
