# Run with rails runner against an isolated, migrated test database only.
require "timeout"
require "net/http"
require "socket"
require_relative "../support/authorization_helpers"
raise "Inventory scratch database required" unless Rails.env.test? && ApplicationRecord.connection_db_config.database.start_with?("apply_inventory_program_")

password = SecureRandom.hex(24)
actor = User.create!(email_address: "cart-race-#{SecureRandom.hex(6)}@example.invalid", password: password)
practice = Clinic::Practice.create!(name: "Cart concurrency fixture")
membership = Clinic::Membership.create!(practice: practice, user: actor)
Object.new.extend(AuthorizationHelpers).grant_permissions!(membership, "inventory.read", "inventory.catalog", "procurement.create")
site = practice.sites.create!(code: "CART", name: "Cart fixture facility", status: "active", address_line1: "100 Fixture Street", city: "Austin", state: "TX", postal_code: "78701", country: "US")
supplier = practice.inventory_suppliers.create!(name: "Cart fixture supplier")
product = practice.pharmacy_products.create!(name: "Cart fixture product", sku: "CART-RACE", ndc: "33333333333", stock_unit: "each", quantity_scale: 0, package_size: 10, unit_reference: "each")
supplier.supplier_products.create!(practice: practice, product: product, ndc: product.ndc, supplier_sku: "CART-OFFER", description: product.name, ordering_unit: "package", currency: "USD", contract_status: "active", package_quantity: 10, wholesale_unit_cost: 10, available: true, imported_at: Time.current)

def race
  ready = Queue.new
  start = Queue.new
  threads = 2.times.map do |index|
    Thread.new do
      ApplicationRecord.connection_pool.with_connection do
        ready << true
        start.pop
        yield index
      end
    end
  end
  Timeout.timeout(30) do
    2.times { ready.pop }
    2.times { start << true }
    threads.map(&:value)
  end
end

carts = race { Clinic::Inventory::PurchaseCart.active_for(practice: practice, actor: actor) }
raise "Concurrent draft creation duplicated carts" unless carts.map(&:id).uniq.one?
puts "PASS: simultaneous draft creation returns one actor-owned cart"
cart = carts.first
cart.update!(destination_site: site, reason: "Fixture replenishment")
offer = Clinic::Inventory::PurchaseCartCheckout.select_offer(product: product, requested_packages: "2")
item = cart.items.create!(practice: practice, product: product, requested_packages: 2, input_unit: "package", conversion_factor: 10,
  selected_supplier_product: offer.supplier_product, selected_supplier: supplier, selected_unit_price: 10,
  selected_currency: "USD", selected_package_quantity: 10, price_snapshot_digest: offer.digest, price_snapshot_at: offer.captured_at, source: "manual", status: "draft")

key = SecureRandom.uuid
results = race { Clinic::Inventory::PurchaseCartCheckout.call(practice: practice, actor: actor, cart_id: cart.id, request_key: key) }
raise "Concurrent checkout duplicated orders" unless results.map { |_cart, orders| orders.map(&:id) }.uniq.one? && cart.purchase_orders.count == 1 && cart.items.sole.purchase_order_line_id.present?
puts "PASS: simultaneous checkout with the same key creates one order and replays the same IDs"

# A writer reads draft before checkout but obtains its lock after checkout commits.
cart = Clinic::Inventory::PurchaseCart.active_for(practice: practice, actor: actor)
cart.update!(destination_site: site, reason: "Fixture stale edit")
item = cart.items.create!(item.attributes.except("id", "cart_id", "purchase_order_line_id", "created_at", "updated_at").merge(status: "draft"))
locked = Queue.new
read = Queue.new
checkout_thread = Thread.new do
  ApplicationRecord.connection_pool.with_connection do
    cart.with_lock do
      locked << true
      Timeout.timeout(30) { read.pop }
      Clinic::Inventory::PurchaseCartCheckout.call(practice: practice, actor: actor, cart_id: cart.id, request_key: SecureRandom.uuid)
    end
  end
end
edit_thread = Thread.new do
  ApplicationRecord.connection_pool.with_connection do
    Timeout.timeout(30) { locked.pop }
    stale = Clinic::Inventory::PurchaseCart.find(cart.id)
    raise "Test did not read draft before checkout" unless stale.status == "draft"
    read << true
    begin
      stale.with_draft_lock { item.reload.update!(requested_packages: 9) }
      :accepted
    rescue ArgumentError
      :denied
    end
  end
end
Timeout.timeout(30) { checkout_thread.value }
raise "Stale edit changed a checked-out item" unless Timeout.timeout(30) { edit_thread.value } == :denied && item.reload.requested_packages == 2 && item.status == "checked_out"
puts "PASS: a draft read before checkout cannot mutate after checkout commits"

# Exercise the actual loopback HTTP server with session cookies and CSRF. Never
# reuse the developer's running server, database, login or browser session.
port = 3016
TCPServer.new("127.0.0.1", port).close # Fail before spawning if the port is occupied.
log_path = Rails.root.join("tmp/inventory-cart-http.log")
server_pid = Process.spawn(RbConfig.ruby, "bin/rails", "server", "-e", "test", "-b", "127.0.0.1", "-p", port.to_s,
  chdir: Rails.root.to_s, out: log_path.to_s, err: log_path.to_s)
begin
  cookies = {}
  request = lambda do |method, path, body = nil, csrf = nil|
    message = Net::HTTP.const_get(method).new(path)
    message["Host"] = "localhost:3000"
    message["Origin"] = "http://localhost:3000"
    message["Content-Type"] = "application/json"
    message["Cookie"] = cookies.map { |name, value| "#{name}=#{value}" }.join("; ")
    message["X-CSRF-Token"] = csrf if csrf
    message.body = JSON.generate(body) if body
    http = Net::HTTP.new("127.0.0.1", port)
    http.open_timeout = 2
    http.read_timeout = 30
    response = http.request(message)
    response.get_fields("set-cookie").to_a.each do |header|
      name, value = header.split(";", 2).first.split("=", 2)
      cookies[name] = value
    end
    response
  end
  Timeout.timeout(120) do
    loop do
      begin
        break if request.call("Get", "/up").code == "200"
      rescue Errno::ECONNREFUSED, Net::OpenTimeout, Net::ReadTimeout
        # The task-owned test server is still starting.
      end
      sleep 1
    end
  end
  csrf = JSON.parse(request.call("Get", "/api/csrf").body).fetch("csrf_token")
  login = request.call("Post", "/api/session", { email_address: actor.email_address, password: password }, csrf)
  raise "HTTP fixture login failed (#{login.code})" unless login.code == "200"
  csrf = JSON.parse(request.call("Get", "/api/csrf").body).fetch("csrf_token")
  supplier.supplier_products.sole.update!(package_quantity: 5)
  added = request.call("Post", "/api/clinic/inventory/purchase-cart/items",
    { item: { product_id: product.id, requested_packages: "3", destination_site_id: site.id, reason: "HTTP fixture receipt plan", source: "manual" } }, csrf)
  raise "HTTP cart add failed (#{added.code})" unless added.code == "201"
  http_cart = JSON.parse(added.body).dig("data", "purchase_cart")
  payload = { checkout: { cart_id: http_cart.fetch("id"), request_key: SecureRandom.uuid } }
  checked_out = request.call("Post", "/api/clinic/inventory/purchase-cart/checkout", payload, csrf)
  replay = request.call("Post", "/api/clinic/inventory/purchase-cart/checkout", payload, csrf)
  raise "HTTP checkout or replay failed" unless checked_out.code == "201" && replay.code == "201"
  raise "HTTP retry returned different orders" unless JSON.parse(checked_out.body).fetch("purchase_order_ids") == JSON.parse(replay.body).fetch("purchase_order_ids")
  puts "PASS: live HTTP session + CSRF -> add cart item -> checkout -> idempotent replay"

  Object.new.extend(AuthorizationHelpers).grant_permissions!(membership, "inventory.receive")
  http_order = practice.inventory_purchase_orders.find(JSON.parse(checked_out.body).fetch("purchase_order_ids").first)
  http_order.update!(status: "sent") # Fixture-only order; no supplier transmission.
  http_line = http_order.lines.sole
  location = practice.inventory_locations.create!(name: "Receiving fixture shelf", kind: "storage")
  delivery = request.call("Post", "/api/clinic/inventory/shipments", { shipment: {
    purchase_order_id: http_order.id, purchase_order_line_id: http_line.id,
    reference: "HTTP-#{SecureRandom.hex(6)}", supplier_reference: "Fixture delivery", package_count: 2,
    delivered_at: Time.current.iso8601, request_key: SecureRandom.uuid
  } }, csrf)
  raise "HTTP delivery failed (#{delivery.code})" unless delivery.code == "201"
  receipt_payload = { receipt: {
    purchase_order_id: http_order.id, purchase_order_line_id: http_line.id,
    shipment_id: JSON.parse(delivery.body).fetch("id"), quantity_packages: 2,
    lot_number: "HTTP-RECEIVE", expiration_date: "2099-01-01", destination_location: location.name,
    reason: "Fixture supplier package check", request_key: SecureRandom.uuid
  } }
  received = request.call("Post", "/api/clinic/inventory/receipts", receipt_payload, csrf)
  replayed = request.call("Post", "/api/clinic/inventory/receipts", receipt_payload, csrf)
  raise "HTTP receipt or replay failed" unless received.code == "200" && replayed.code == "200"
  receipt_id = JSON.parse(received.body).fetch("receipt_id")
  raise "HTTP receipt retry changed identity" unless receipt_id == JSON.parse(replayed.body).fetch("receipt_id")
  receipt_line = Clinic::Inventory::Receipt.find(receipt_id).lines.sole
  raise "HTTP receipt used catalog conversion" unless receipt_line.quantity == 10 && receipt_line.conversion_factor == 5 && receipt_line.batch.reload.quantity == 10
  raise "HTTP order remaining quantity incorrect" unless http_line.reload.received_quantity == 2 && http_line.remaining_quantity == 4
  puts "PASS: live HTTP delivered shipment -> supplier-package receipt -> exact stock and PO remainder -> replay"
  next_shipment = http_order.shipments.create!(practice: practice, actor: actor, reference: "RACE-#{SecureRandom.hex(6)}",
    supplier_reference: "Fixture race delivery", status: "delivered", package_count: 2, expected_units: 10,
    delivered_at: Time.current, request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16))
  next_shipment.shipment_lines.create!(practice: practice, purchase_order_line: http_line, expected_packages: 2)
  receipt_key = SecureRandom.uuid
  receipts = race do
    Clinic::Inventory::Receiving.call(practice: practice, actor: actor, purchase_order: http_order, shipment: next_shipment,
      lines: [ { product_id: product.id, purchase_order_line_id: http_line.id, lot_number: "HTTP-RECEIVE",
        expires_on: "2099-01-01", location: location.name, amount: "2", input_unit: "package" } ],
      reason: "Fixture receipt race", request_key: receipt_key)
  end
  raise "Concurrent receipt duplicated stock" unless receipts.map(&:id).uniq.one? && receipt_line.batch.reload.quantity == 20 && http_line.reload.received_quantity == 4
  puts "PASS: independent connections receive the same shipment once with supplier package units"
ensure
  Process.kill("KILL", server_pid) if server_pid
  Process.wait(server_pid) if server_pid
end
