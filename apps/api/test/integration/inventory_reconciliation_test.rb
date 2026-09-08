require "test_helper"

class InventoryReconciliationTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(20)
    @actor = User.create!(email_address: "reconciliation@example.invalid", password: password)
    @practice = Clinic::Practice.create!(name: "Reconciliation fixture")
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "inventory.read", "inventory.receive", "inventory.adjust", "procurement.read", "procurement.approve")
    @location = @practice.inventory_locations.create!(name: "Receiving shelf", kind: "storage")
    supplier = @practice.inventory_suppliers.create!(name: "Fixture vendor")
    @order = @practice.inventory_purchase_orders.create!(actor: @actor, supplier: supplier, number: "TEST-PO", status: "sent",
      destination: "Fixture shelf", reason: "Fixture", request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(32),
      subtotal: 30, total: 30, shipping: 0, tax: 0)
    @lines = 2.times.map do |i|
      product = @practice.pharmacy_products.create!(name: "Fixture #{i}", sku: "RECON-#{i}", stock_unit: "each", package_size: 5, quantity_scale: 0, unit_reference: "Fixture package")
      @order.lines.create!(practice: @practice, product: product, product_name: product.name, stock_unit: "each", input_unit: "package",
        conversion_factor: 5, ordered_quantity: 3, received_quantity: 0, unit_price: 5, currency: "USD")
    end
    get "/api/csrf", headers: @headers
    post "/api/session", params: { email_address: @actor.email_address, password: password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "multi-line packing slip posts once and rejects changed replay" do
    input = session_input
    receive(input)
    assert_response :created
    assert_equal @order.id.to_s, response.parsed_body.dig("data", "purchase_order_id")
    assert_equal input[:request_key], response.parsed_body.dig("data", "request_key")
    assert_equal 2, @order.receipts.count
    assert_equal [2.to_d, 2.to_d], @lines.map { |line| line.reload.received_quantity }
    assert_equal 20, Clinic::Inventory::PharmacyBatch.where(practice_id: @practice.id).sum(:on_hand)
    receive(input)
    assert_response :created
    assert_equal 2, @order.receipts.count
    receive(input.merge(reference: "Changed"))
    assert_response :unprocessable_entity
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "invalid second line rolls back first receipt and all shipments" do
    input = session_input
    input[:lines][1][:destination_location_id] = -1
    receive(input)
    assert_response :not_found
    assert_empty @order.receipts
    assert_empty @order.shipments
    assert_equal [0.to_d, 0.to_d], @lines.map { |line| line.reload.received_quantity }
  end

  test "foreign order and receiving permission denial do not post" do
    other = Clinic::Practice.create!(name: "Other fixture")
    other_actor = User.create!(email_address: "other-reconciliation@example.invalid", password: SecureRandom.hex(20))
    other.memberships.create!(user: other_actor)
    foreign = other.inventory_purchase_orders.create!(actor: other_actor, number: "FOREIGN", status: "sent", destination: "Fixture", reason: "Fixture", request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(32))
    post "/api/clinic/inventory/purchase-orders/#{foreign.id}/receiving-sessions", params: { session: session_input }, headers: csrf_headers, as: :json
    assert_response :not_found
    set_permission!(@membership, "inventory.receive", false)
    receive(session_input)
    assert_response :forbidden
    assert_empty @order.receipts
  end

  test "return and supplier credit preserve exact stock and reject overreturn and overcredit" do
    receive(session_input)
    assert_response :created
    receipt = @order.receipts.first.lines.sole
    input = { reference: "RMA-1", reason: "Returned unopened", request_key: SecureRandom.uuid, receipt_line_id: receipt.id.to_s, quantity: "5" }
    post_operation("returns", :return, input)
    assert_response :created
    returned_id = response.parsed_body.dig("data", "id")
    assert_equal 5, receipt.batch.reload.quantity
    post_operation("returns", :return, input)
    assert_response :created
    assert_equal 5, receipt.batch.reload.quantity
    post_operation("returns", :return, input.merge(request_key: SecureRandom.uuid, quantity: "6"))
    assert_response :unprocessable_entity
    credit = { reference: "CREDIT-1", reason: "Vendor confirmed", request_key: SecureRandom.uuid, vendor_return_id: returned_id, amount: "5", currency: "USD" }
    post_operation("credits", :credit, credit)
    assert_response :created
    post_operation("credits", :credit, credit)
    assert_response :created
    post_operation("credits", :credit, credit.merge(request_key: SecureRandom.uuid, reference: "CREDIT-2", amount: "1"))
    assert_response :unprocessable_entity
    assert_equal 1, Clinic::Inventory::SupplierCredit.where(practice_id: @practice.id).count
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "invoice discrepancies can be corrected but matched quantities cannot be invoiced twice" do
    receive(session_input)
    input = { reference: "INV-1", reason: "Packing slip match", request_key: SecureRandom.uuid, amount: "10", currency: "USD", tax: "0", shipping: "0",
      lines: [{ purchase_order_line_id: @lines.first.id.to_s, quantity_packages: "2", unit_price: "6" }] }
    post_operation("invoices", :invoice, input)
    assert_response :created
    assert_equal "discrepancy", response.parsed_body.dig("data", "status")
    old_id = response.parsed_body.dig("data", "id")
    input[:lines][0][:unit_price] = "5"
    input = input.merge(request_key: SecureRandom.uuid, supersedes_id: old_id)
    post_operation("invoices", :invoice, input)
    assert_response :created
    assert_equal "matched", response.parsed_body.dig("data", "status")
    post_operation("invoices", :invoice, input.merge(reference: " INV-1 ", request_key: SecureRandom.uuid))
    assert_response :unprocessable_entity
    post_operation("invoices", :invoice, input)
    assert_response :created
    post_operation("invoices", :invoice, input.except(:supersedes_id).merge(reference: "INV-2", request_key: SecureRandom.uuid))
    assert_response :created
    assert_equal "discrepancy", response.parsed_body.dig("data", "status")
    assert_match(/accepted receipts/, response.parsed_body.dig("data", "details", "discrepancies").join)
    get "/api/clinic/inventory/purchase-orders/#{@order.id}/reconciliation", headers: @headers
    assert_response :success
    assert_equal 3, response.parsed_body.dig("data", "invoices").size
    assert_equal 2, response.parsed_body.dig("data", "receipt_lines").size
  end

  test "mixed accepted and rejected lines commit one session without rejected stock" do
    input = session_input
    input[:lines][1].merge!(accepted_packages: "0", reconciliation: { missing_packages: "0", rejected_packages: "2", excess_packages: "0", exception: "damaged" })
    receive(input)
    assert_response :created
    assert_equal 1, @order.receipts.count
    assert_equal [2.to_d, 0.to_d], @lines.map { |line| line.reload.received_quantity }
    assert_equal 1, Clinic::Inventory::ShipmentReconciliation.where(practice_id: @practice.id).count
    session = Clinic::Inventory::ReceivingSession.find(response.parsed_body.dig("data", "id"))
    assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) { session.update_columns(reason: "Changed") }
    end
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "posting permissions are enforced for returns credits and invoices" do
    set_permission!(@membership, "inventory.adjust", false)
    set_permission!(@membership, "procurement.approve", false)
    common = { reference: "DENIED", reason: "Permission fixture", request_key: SecureRandom.uuid }
    post_operation("returns", :return, common.merge(receipt_line_id: "-1", quantity: "1"))
    assert_response :forbidden
    post_operation("credits", :credit, common.merge(vendor_return_id: "-1", amount: "1", currency: "USD"))
    assert_response :forbidden
    post_operation("invoices", :invoice, common.merge(amount: "1", currency: "USD", lines: []))
    assert_response :forbidden
    assert_empty Clinic::Inventory::VendorReturn.where(practice_id: @practice.id)
    assert_empty Clinic::Inventory::SupplierCredit.where(practice_id: @practice.id)
    assert_empty Clinic::Inventory::SupplierInvoice.where(practice_id: @practice.id)
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def session_input
    { reference: "PACK-1", reason: "Verified packing slip", request_key: SecureRandom.uuid,
      lines: @lines.map { |line| { purchase_order_line_id: line.id.to_s, delivered_packages: "2", accepted_packages: "2",
        lot_number: "LOT-#{line.id}", expiration_date: "2099-01-01", destination_location_id: @location.id.to_s } } }
  end

  def receive(input)
    post_operation("receiving-sessions", :session, input)
  end

  def post_operation(action, root, input)
    post "/api/clinic/inventory/purchase-orders/#{@order.id}/#{action}", params: { root => input }, headers: csrf_headers, as: :json
  end
end
