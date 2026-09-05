require "test_helper"

class Clinic::Inventory::ReceivingTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "receiving@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Receiving fixture clinic")
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "inventory.receive")
    @product = @practice.pharmacy_products.create!(name: "Fixture liquid", sku: "RECEIVE", stock_unit: "mL", quantity_scale: 3, package_size: "10.5", unit_reference: "Fixture catalog package")
    @order = order_for(@practice)
    @order_line = @order.lines.create!(practice: @practice, product: @product, product_name: @product.name,
      stock_unit: "mL", input_unit: "package", ordered_quantity: 3, received_quantity: 0,
      conversion_factor: "7.25", unit_price: 1, currency: "USD")
    @shipment = @order.shipments.create!(practice: @practice, actor: @actor, reference: "FIXTURE-SHIP",
      supplier_reference: "FIXTURE-SUPPLIER", status: "delivered", package_count: 2, expected_units: "14.5",
      delivered_at: Time.current, request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16))
    @shipment.shipment_lines.create!(practice: @practice, purchase_order_line: @order_line, expected_packages: 2)
    @input = { product_id: @product.id, lot_number: "FIXTURE-LOT", location: "Shelf",
      expires_on: (Date.current + 90).iso8601, amount: "2", input_unit: "package", purchase_order_line_id: @order_line.id }
  end

  test "supplier packages post exact snapshot units and replay without duplicate stock" do
    key = SecureRandom.uuid
    receipt = receive(key: key)
    row = receipt.lines.sole
    assert_equal BigDecimal("7.25"), row.conversion_factor
    assert_equal BigDecimal("14.5"), row.quantity
    assert_equal BigDecimal("14.5"), row.batch.reload.quantity
    assert_equal BigDecimal("2"), @order_line.reload.received_quantity
    assert_equal BigDecimal("1"), @order_line.remaining_quantity
    assert_equal "partially_received", @order.reload.status
    assert_equal receipt.id, receive(key: key).id
    assert_equal 1, @shipment.receipts.count
    assert_raises(ArgumentError) { receive }
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "standalone package and stock-unit receipts retain catalog conversion" do
    row = receive(order: nil, shipment: nil, input: @input.except(:purchase_order_line_id)).lines.sole
    assert_equal BigDecimal("21"), row.quantity
    assert_equal BigDecimal("10.5"), row.conversion_factor
    row = receive(order: nil, shipment: nil, input: @input.except(:purchase_order_line_id).merge(amount: "0.125", input_unit: "mL")).lines.sole
    assert_equal BigDecimal("0.125"), row.quantity
    assert_equal BigDecimal("21.125"), row.batch.reload.quantity
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "order-linked receipt requires matching line even without a shipment" do
    other_order = order_for(@practice)
    [
      { order: nil, input: @input },
      { order: other_order, input: @input },
      { input: @input.except(:purchase_order_line_id) },
      { input: @input.merge(input_unit: "mL") }
    ].each do |options|
      assert_no_difference "Clinic::Inventory::Receipt.count" do
        assert_raises(ArgumentError) { receive(shipment: nil, **options) }
      end
    end
    assert_equal 0, @order_line.reload.received_quantity
    assert_empty @product.batches
  end

  test "foreign order is rejected before posting" do
    other_practice = Clinic::Practice.create!(name: "Other fixture clinic")
    other_actor = User.create!(email_address: "other-receiving@example.invalid", password: SecureRandom.hex(20))
    other_practice.memberships.create!(user: other_actor)
    assert_no_difference "Clinic::Inventory::Receipt.count" do
      assert_raises(ActiveRecord::RecordNotFound) { receive(order: order_for(other_practice, actor: other_actor)) }
    end
    assert_empty @product.batches
  end

  test "mismatched product and stock unit roll back all receipt evidence" do
    other_product = @practice.pharmacy_products.create!(name: "Other fixture", sku: "OTHER", stock_unit: "each", quantity_scale: 0, package_size: 1, unit_reference: "Fixture")
    assert_raises(ArgumentError) { receive(shipment: nil, input: @input.merge(product_id: other_product.id)) }
    @order_line.update!(stock_unit: "each")
    assert_raises(ArgumentError) { receive(shipment: nil) }
    assert_empty Clinic::Inventory::Receipt.where(practice_id: @practice.id)
    assert_empty @product.batches
  end

  test "SQL bypass rejects catalog conversion and mismatched order linkage" do
    row = receive.lines.sole
    other_order = order_for(@practice)
    other_line = other_order.lines.create!(@order_line.attributes.except("id", "purchase_order_id", "created_at", "updated_at").merge(received_quantity: 0))
    [
      { conversion_factor: "10.5", quantity: "21" },
      { purchase_order_line_id: other_line.id },
      { purchase_order_line_id: nil },
      { input_unit: "mL", conversion_factor: 1, quantity: 2 }
    ].each do |changes|
      error = assert_raises(ActiveRecord::StatementInvalid) do
        ApplicationRecord.transaction(requires_new: true) do
          Clinic::Inventory::ReceiptLine.insert_all!([ row.attributes.except("id").merge(changes.stringify_keys) ])
        end
      end
      assert_match(/Receipt (conversion|units and product)/, error.message)
    end
    assert_equal BigDecimal("14.5"), row.batch.reload.quantity
  end

  test "shipment short and over receipts still require discrepancy resolution" do
    [ "1", "3" ].each do |amount|
      assert_no_difference "Clinic::Inventory::Receipt.count" do
        assert_raises(ArgumentError) { receive(input: @input.merge(amount: amount)) }
      end
    end
  end

  private

  def order_for(practice, actor: @actor)
    practice.inventory_purchase_orders.create!(actor: actor, number: "PO-#{SecureRandom.hex(4)}", status: "sent",
      destination: "Shelf", reason: "Fixture delivery", request_key: SecureRandom.uuid,
      payload_digest: SecureRandom.hex(16), version: 1, subtotal: 3, tax: 0, shipping: 0, total: 3)
  end

  def receive(order: @order, shipment: @shipment, input: @input, key: SecureRandom.uuid)
    Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, purchase_order: order,
      shipment: shipment, lines: [ input ], reason: "Fixture delivery", request_key: key)
  end
end
