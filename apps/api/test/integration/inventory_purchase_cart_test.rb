require "test_helper"

class InventoryPurchaseCartTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "cart-test@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    @site = @practice.sites.create!(code: "MAIN", name: "Main synthetic facility", status: "active", address_line1: "100 Main Street", city: "Austin", state: "TX", postal_code: "78701", country: "US")
    @supplier_one = @practice.inventory_suppliers.create!(name: "Supplier One")
    @supplier_two = @practice.inventory_suppliers.create!(name: "Supplier Two")
    @product_one = @practice.pharmacy_products.create!(name: "Cart Product One", sku: "CART-001", ndc: "11111111111", stock_unit: "each", quantity_scale: 0, package_size: 10, unit_reference: "each")
    @product_two = @practice.pharmacy_products.create!(name: "Cart Product Two", sku: "CART-002", ndc: "22222222222", stock_unit: "each", quantity_scale: 0, package_size: 5, unit_reference: "each")
    supplier_product(@supplier_one, @product_one, "10.00", "SUP-1")
    supplier_product(@supplier_two, @product_two, "7.50", "SUP-2")
  end

  test "merges duplicate products and creates one purchase order per supplier at checkout" do
    add_item(@product_one, "2")
    add_item(@product_one, "3")
    add_item(@product_two, "1")

    cart = Clinic::Inventory::PurchaseCart.find(response.parsed_body.dig("data", "purchase_cart", "id"))
    assert_equal 2, cart.items.count
    assert_equal "5.0", cart.items.find_by(product: @product_one).requested_packages.to_s

    assert_difference "Clinic::Inventory::PurchaseOrder.count", 2 do
      post "/api/clinic/inventory/purchase-cart/checkout", params: { checkout: { cart_id: cart.id, request_key: SecureRandom.uuid } }, headers: csrf_headers, as: :json
      assert_response :created
    end
    orders = @practice.inventory_purchase_orders.where(purchase_cart_id: cart.id).to_a
    assert_equal 2, orders.size
    assert_equal 1, orders.map(&:checkout_group_id).uniq.size
    wire_orders = response.parsed_body.dig("data", "purchase_orders").select { |order| orders.map { |record| record.id.to_s }.include?(order["id"]) }
    assert_equal 1, wire_orders.map { |order| order["checkout_group_id"] }.uniq.size
    assert orders.all? { |order| order.supplier_id.present? && order.lines.one? }
    assert orders.flat_map(&:lines).all? { |line| !line.attributes.key?("supplier_id") && line.price_snapshot_digest.present? }
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def add_item(product, quantity)
    post "/api/clinic/inventory/purchase-cart/items", params: { item: { product_id: product.id, requested_packages: quantity, destination_site_id: @site.id, reason: "Synthetic replenishment", source: "manual" } }, headers: csrf_headers, as: :json
    assert_response :created
  end

  def supplier_product(supplier, product, price, sku)
    supplier.supplier_products.create!(practice_id: @practice.id, product: product, ndc: product.ndc, supplier_sku: sku, description: product.name, ordering_unit: "package", currency: "USD", contract_status: "active", package_quantity: product.package_size, wholesale_unit_cost: price, available: true, effective_date: Date.current, imported_at: Time.current)
  end
end
