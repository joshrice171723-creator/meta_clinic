require "test_helper"

class InventoryPurchaseCartTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "cart-test@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Purchase cart fixture clinic")
    @membership = Clinic::Membership.create!(practice: @practice, user: @user)
    %w[inventory.read inventory.catalog procurement.create].each { |permission| grant_permissions!(@membership, permission) }
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

  test "add retries are side effect free and changed payloads conflict" do
    key = SecureRandom.uuid
    post_item(@product_one, "2", request_key: key)
    assert_response :created
    item = active_cart.items.sole
    assert_equal false, response.parsed_body.fetch("replayed")

    assert_no_difference "Clinic::Inventory::PurchaseCartItem.count" do
      post_item(@product_one, "2", request_key: key)
      assert_response :created
    end
    assert_equal true, response.parsed_body.fetch("replayed")
    assert_equal BigDecimal("2"), item.reload.requested_packages

    post_item(@product_one, "3", request_key: key)
    assert_response :conflict
    assert_equal BigDecimal("2"), item.reload.requested_packages
  end

  test "rejects a foreign destination without changing the cart" do
    add_item(@product_one, "2")
    cart = active_cart
    before = cart.attributes
    foreign_practice = Clinic::Practice.create!(name: "Other fixture clinic")
    foreign_site = foreign_practice.sites.create!(code: "OTHER", name: "Other facility", status: "active")

    post_item(@product_two, "1", destination_site_id: foreign_site.id)
    assert_response :not_found
    assert_equal before, cart.reload.attributes
    assert_equal 1, cart.items.count
    assert_not cart.update(destination_site: foreign_site)
  end

  test "rejects inactive destinations at add and checkout and incomplete addresses at checkout" do
    add_item(@product_one, "2")
    cart = active_cart
    @site.update!(status: "temporarily_closed")
    post_item(@product_two, "1")
    assert_response :unprocessable_entity
    assert_equal 1, cart.items.count
    checkout(cart)
    assert_response :unprocessable_entity
    @site.update!(status: "active", address_line1: nil)
    checkout(cart)
    assert_response :unprocessable_entity
    assert_equal "draft", cart.reload.status
    assert_empty cart.purchase_orders
  end

  test "rejects malformed fractional and cumulatively excessive package quantities" do
    add_item(@product_one, "999999")
    cart = active_cart
    [ "-1", "0", "NaN", "Infinity", "1e2", "0.5", "1000001" ].each do |quantity|
      post_item(@product_one, quantity)
      assert_response :unprocessable_entity
    end
    post_item(@product_one, "2")
    assert_response :unprocessable_entity
    assert_equal BigDecimal("999999"), cart.items.sole.requested_packages
  end

  test "rejects invalid source and ignores client supplied authority and prices" do
    post_item(@product_one, "2", source: "forged")
    assert_response :unprocessable_entity
    assert_empty Clinic::Inventory::PurchaseCart.where(practice: @practice)
    post_item(@product_one, "2", actor_id: -1, practice_id: -1, status: "checked_out", selected_unit_price: "0", selected_supplier_id: @supplier_two.id)
    assert_response :created
    item = active_cart.items.sole
    assert_equal "draft", item.status
    assert_equal @supplier_one.id, item.selected_supplier_id
    assert_equal BigDecimal("10"), item.selected_unit_price
    assert_equal @user.id, item.cart.actor_id
    assert_equal @practice.id, item.practice_id
  end

  test "checkout rejects changed price and preserves the draft for explicit refresh" do
    add_item(@product_one, "2")
    cart = active_cart
    before = cart.attributes
    @supplier_one.supplier_products.sole.update!(wholesale_unit_cost: "12")
    checkout(cart)
    assert_response :conflict
    assert_equal "cart_offer_changed", response.parsed_body["code"]
    assert_equal before, cart.reload.attributes
    assert_empty cart.purchase_orders
    patch_item(cart.items.sole, "2")
    assert_response :success
    checkout(cart)
    assert_response :created
    assert_equal BigDecimal("24"), cart.purchase_orders.sole.total
  end

  test "quoted fee changes require explicit refresh and checkout preserves fee evidence without calculating it" do
    offer = @supplier_one.supplier_products.sole
    offer.update!(price_source: "manual_quote", quote_reference: "SYN-FEE-CART", quoted_on: @practice.inventory_date,
      quoted_fee_amount: "2", quoted_fee_currency: "USD", quoted_fee_basis: "Entire quoted shipment")
    add_item(@product_one, "2")
    cart = active_cart
    offer.update!(quoted_fee_amount: "3.230001")
    checkout(cart)
    assert_response :conflict
    assert_equal "cart_offer_changed", response.parsed_body["code"]
    assert_empty cart.purchase_orders
    patch_item(cart.items.sole, "2")
    assert_response :success
    checkout(cart)
    assert_response :created
    order = cart.purchase_orders.sole
    line = order.lines.sole
    assert_equal BigDecimal("20"), order.total
    assert_equal BigDecimal("3.230001"), line.quoted_fee_amount
    assert_equal "USD", line.quoted_fee_currency
    assert_equal "Entire quoted shipment", line.quoted_fee_basis
    offer.update!(quoted_fee_amount: "5")
    assert_equal BigDecimal("3.230001"), line.reload.quoted_fee_amount
  end

  test "checkout rejects changed supplier SKU and ordering unit snapshots" do
    add_item(@product_one, "2")
    cart = active_cart
    @supplier_one.supplier_products.sole.update!(supplier_sku: "NEW-SKU")
    checkout(cart)
    assert_response :conflict
    patch_item(cart.items.sole, "2")
    assert_response :success
    @supplier_one.supplier_products.sole.update!(ordering_unit: "case")
    checkout(cart)
    assert_response :unprocessable_entity
    assert_match(/No eligible supplier offer/, response.parsed_body.fetch("error"))
    assert_empty cart.purchase_orders
  end

  test "checkout rejects unavailable offers inactive products and mixed currencies atomically" do
    add_item(@product_one, "2")
    cart = active_cart
    offer = @supplier_one.supplier_products.sole
    offer.update!(available: false)
    checkout(cart)
    assert_response :unprocessable_entity
    offer.update!(available: true)
    @product_one.update_catalog!({ active: false }, actor: @user)
    checkout(cart)
    assert_response :unprocessable_entity
    @product_one.update_catalog!({ active: true }, actor: @user)
    @supplier_two.supplier_products.sole.update!(currency: "CAD")
    add_item(@product_two, "1")
    checkout(cart)
    assert_response :unprocessable_entity
    assert_equal "draft", cart.reload.status
    assert_equal [ "draft" ], cart.items.pluck(:status).uniq
    assert_empty cart.purchase_orders
  end

  test "same checkout key replays exactly once and cannot be reused for another cart" do
    add_item(@product_one, "2")
    cart = active_cart
    key = SecureRandom.uuid
    checkout(cart, key)
    assert_response :created
    ids = response.parsed_body.fetch("purchase_order_ids")
    assert_no_difference "Clinic::Inventory::PurchaseOrder.count" do
      checkout(cart, key)
      assert_response :created
      assert_equal ids, response.parsed_body.fetch("purchase_order_ids")
      checkout(cart)
      assert_response :unprocessable_entity
    end
    add_item(@product_two, "1")
    next_cart = active_cart
    checkout(next_cart, key)
    assert_response :unprocessable_entity
    assert_equal "draft", next_cart.reload.status
    assert_empty next_cart.purchase_orders
  end

  test "checkout rejects malformed keys and normalizes uppercase UUID retries" do
    add_item(@product_one, "2")
    cart = active_cart
    checkout(cart, "-" * 36)
    assert_response :unprocessable_entity
    assert_empty cart.purchase_orders
    key = SecureRandom.uuid
    checkout(cart, key.upcase)
    assert_response :created
    assert_equal key, cart.reload.request_key
    checkout(cart, key)
    assert_response :created
    assert_equal 1, cart.purchase_orders.count
  end

  test "checked out items and stale draft objects cannot be edited or removed" do
    add_item(@product_one, "2")
    cart = active_cart
    item = cart.items.sole
    stale = Clinic::Inventory::PurchaseCart.find(cart.id)
    checkout(cart)
    assert_response :created
    patch_item(item, "3")
    assert_response :not_found
    delete "/api/clinic/inventory/purchase-cart/items/#{item.id}", headers: csrf_headers, as: :json
    assert_response :not_found
    assert_raises(ArgumentError) { stale.with_draft_lock { flunk "A stale cart must not yield for mutation" } }
    assert_equal BigDecimal("2"), item.reload.requested_packages
    assert_equal "checked_out", item.status
  end

  test "other actors and clinics cannot modify or checkout this cart" do
    add_item(@product_one, "2")
    cart = active_cart
    item = cart.items.sole
    other = User.create!(email_address: "other-cart@example.invalid", password: @password)
    membership = Clinic::Membership.create!(practice: @practice, user: other)
    grant_permissions!(membership, "inventory.read", "procurement.create")
    post "/api/session", params: { email_address: other.email_address, password: @password }, headers: csrf_headers, as: :json
    patch_item(item, "3")
    assert_response :not_found
    checkout(cart)
    assert_response :not_found
    foreign = Clinic::Practice.create!(name: "Other cart fixture clinic")
    assert_raises(Clinic::Authorization::Denied) do
      Clinic::Inventory::PurchaseCartCheckout.call(practice: foreign, actor: other, cart_id: cart.id, request_key: SecureRandom.uuid)
    end
    assert_equal BigDecimal("2"), item.reload.requested_packages
  end

  test "revoked procurement permission prevents every cart mutation" do
    add_item(@product_one, "2")
    cart = active_cart
    item = cart.items.sole
    set_permission!(@membership, "procurement.create", false)
    post_item(@product_two, "1")
    assert_response :forbidden
    patch_item(item, "3")
    assert_response :forbidden
    delete "/api/clinic/inventory/purchase-cart/items/#{item.id}", headers: csrf_headers, as: :json
    assert_response :forbidden
    patch "/api/clinic/inventory/purchase-cart", params: { cart: { reason: "Changed" } }, headers: csrf_headers, as: :json
    assert_response :forbidden
    checkout(cart)
    assert_response :forbidden
    assert_equal "draft", cart.reload.status
    assert_equal BigDecimal("2"), item.reload.requested_packages
  end

  test "late failure rolls back every supplier order line event and cart item" do
    add_item(@product_one, "2")
    add_item(@product_two, "1")
    cart = active_cart
    # Abort PostgreSQL while saving the second order's event, after the first
    # order and both lines have been written. Always remove the test callback.
    supplier_id = @supplier_two.id
    fail_second_event = ->(event) { event.class.connection.execute("SELECT 1 / 0") if event.purchase_order.supplier_id == supplier_id }
    Clinic::Inventory::PurchaseOrderEvent.set_callback(:create, :before, fail_second_event)
    before = cart.attributes
    counts = [ Clinic::Inventory::PurchaseOrder, Clinic::Inventory::PurchaseOrderLine, Clinic::Inventory::PurchaseOrderEvent ].map(&:count)
    assert_raises(ActiveRecord::StatementInvalid) do
      Clinic::Inventory::PurchaseOrder.transaction(requires_new: true) do
        Clinic::Inventory::PurchaseCartCheckout.call(practice: @practice, actor: @user, cart_id: cart.id, request_key: SecureRandom.uuid)
      end
    end
    assert_equal counts, [ Clinic::Inventory::PurchaseOrder, Clinic::Inventory::PurchaseOrderLine, Clinic::Inventory::PurchaseOrderEvent ].map(&:count)
    assert_equal before, cart.reload.attributes
    assert_equal [ "draft" ], cart.items.pluck(:status).uniq
    assert cart.items.all? { |row| row.purchase_order_line_id.nil? }
  ensure
    Clinic::Inventory::PurchaseOrderEvent.skip_callback(:create, :before, fail_second_event) if fail_second_event
  end

  private

  def active_cart
    Clinic::Inventory::PurchaseCart.find_by!(practice: @practice, actor: @user, status: "draft")
  end

  def checkout(cart, key = SecureRandom.uuid)
    post "/api/clinic/inventory/purchase-cart/checkout", params: { checkout: { cart_id: cart.id, request_key: key } }, headers: csrf_headers, as: :json
  end

  def patch_item(item, quantity)
    patch "/api/clinic/inventory/purchase-cart/items/#{item.id}", params: { item: { requested_packages: quantity } }, headers: csrf_headers, as: :json
  end

  def post_item(product, quantity, request_key: SecureRandom.uuid, **extra)
    post "/api/clinic/inventory/purchase-cart/items", params: { item: { product_id: product.id, requested_packages: quantity, destination_site_id: @site.id, reason: "Synthetic replenishment", source: "manual", request_key: request_key }.merge(extra) }, headers: csrf_headers, as: :json
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def add_item(product, quantity)
    post_item(product, quantity)
    assert_response :created
  end

  def supplier_product(supplier, product, price, sku)
    supplier.supplier_products.create!(practice_id: @practice.id, product: product, ndc: product.ndc, supplier_sku: sku, description: product.name, ordering_unit: "package", currency: "USD", contract_status: "active", package_quantity: product.package_size, wholesale_unit_cost: price, available: true, effective_date: Date.current, imported_at: Time.current)
  end
end
