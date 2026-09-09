require "test_helper"

class Clinic::Inventory::ReceivingTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "receiving@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Receiving fixture clinic")
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "inventory.receive")
    @product = @practice.pharmacy_products.create!(name: "Fixture liquid", sku: "RECEIVE", stock_unit: "mL", quantity_scale: 3, package_size: "10.5", unit_reference: "Fixture catalog package")
    @practice.inventory_locations.create!(name: "Shelf", kind: "storage")
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

  test "short delivery posts accepted stock and retains missing PO packages" do
    receipt = receive(input: @input.merge(amount: "1"), reconciliation: { missing_packages: "1", exception: "short_delivery" })
    assert_equal BigDecimal("7.25"), receipt.lines.sole.batch.quantity
    assert_equal BigDecimal("1"), @order_line.reload.received_quantity
    assert_equal BigDecimal("2"), @order_line.remaining_quantity
    assert_equal "reconciled_with_discrepancy", @shipment.reload.effective_status
    assert_equal BigDecimal("1"), @shipment.reconciliation.missing_packages
    assert_raises(ArgumentError) { receive }
    wire = Clinic::Inventory::InventoryWire.shipment_wire(@shipment)
    assert_equal "1.0", wire.dig(:reconciliation, :accepted_packages)
    assert_equal "short_delivery", wire.dig(:reconciliation, :exception)
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "all rejected packages preserve observations without inventing stock or a receipt" do
    key = SecureRandom.uuid
    input = @input.merge(amount: "0", lot_number: "UNEXPECTED-LOT", expires_on: "", location: "")
    options = { input: input, key: key, reconciliation: { rejected_packages: "2", exception: "wrong_lot" } }
    record = receive(**options)
    assert_instance_of Clinic::Inventory::ShipmentReconciliation, record
    assert_nil record.receipt_id
    assert_equal "UNEXPECTED-LOT", record.observations.sole.fetch("lot_number")
    assert_empty Clinic::Inventory::Receipt.where(practice_id: @practice.id)
    assert_empty @product.batches
    assert_empty Clinic::Inventory::Lot.where(practice_id: @practice.id)
    assert_equal 0, @order_line.reload.received_quantity
    assert_equal record.id, receive(**options).id
    assert_raises(ArgumentError) { receive(**options.merge(reconciliation: { missing_packages: "2", exception: "short_delivery" })) }
    assert_raises(ArgumentError) { receive(**options.merge(key: SecureRandom.uuid)) }
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "damaged and excess packages are rejected while accepted packages post once" do
    receipt = receive(input: @input.merge(amount: "1"), reconciliation: { rejected_packages: "1", excess_packages: "3", exception: "damaged" })
    assert_equal BigDecimal("7.25"), receipt.lines.sole.batch.quantity
    assert_equal BigDecimal("3"), @shipment.reload.reconciliation.excess_packages
    assert_equal BigDecimal("2"), @order_line.reload.remaining_quantity
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "unbalanced malformed and unexplained discrepancies roll back" do
    [
      { missing_packages: "2", exception: "short_delivery" },
      { missing_packages: "0.5", exception: "short_delivery" },
      { rejected_packages: "-1", exception: "damaged" },
      { excess_packages: "1000001", exception: "excess" },
      { missing_packages: "1", exception: "unknown" },
      { exception: "other" }
    ].each do |discrepancy|
      assert_raises(ArgumentError) { receive(input: @input.merge(amount: "1"), reconciliation: discrepancy) }
    end
    assert_empty Clinic::Inventory::ShipmentReconciliation.where(practice_id: @practice.id)
    assert_empty @product.batches
  end

  test "failed accepted lot validation rolls back reconciliation and posting together" do
    receive(order: nil, shipment: nil, input: @input.except(:purchase_order_line_id))
    assert_raises(ArgumentError) do
      receive(input: @input.merge(amount: "1", expires_on: (Date.current + 91).iso8601), reconciliation: { rejected_packages: "1", exception: "expiry" })
    end
    assert_nil @shipment.reload.reconciliation
    assert_empty @shipment.receipts
    assert_equal BigDecimal("21"), @product.batches.sole.quantity
    assert_equal 0, @order_line.reload.received_quantity
  end

  test "SQL preserves reconciliation and shipment history and refuses a later receipt" do
    record = receive(input: @input.merge(amount: "0"), reconciliation: { missing_packages: "2", exception: "short_delivery" })
    [ record, @shipment, @shipment.shipment_lines.sole ].each do |row|
      assert_raises(ActiveRecord::StatementInvalid) do
        ApplicationRecord.transaction(requires_new: true) { row.class.where(id: row.id).delete_all }
      end
    end
    error = assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        Clinic::Inventory::Receipt.create!(practice: @practice, actor: @actor, profile: @practice.inventory_profiles.sole,
          purchase_order: @order, shipment: @shipment, status: "received", received_at: Time.current,
          reason: "Rejected duplicate fixture", request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(32))
      end
    end
    assert_match(/Shipment already reconciled/, error.message)
    error = assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        Clinic::Inventory::ShipmentReconciliation.insert_all!([ record.attributes.except("id").merge("missing_packages" => "1", "request_key" => SecureRandom.uuid) ])
      end
    end
    assert_match(/balance the delivered shipment/, error.message)
  end

  test "SQL refuses reconciliation counts that disagree with receipt postings" do
    receipt = receive
    error = assert_raises(ActiveRecord::StatementInvalid) do
      ApplicationRecord.transaction(requires_new: true) do
        Clinic::Inventory::ShipmentReconciliation.create!(practice: @practice, shipment: @shipment, receipt: receipt,
          actor: @actor, profile: @practice.inventory_profiles.sole, accepted_packages: 1, missing_packages: 1,
          rejected_packages: 0, excess_packages: 0, exception: "short_delivery", reason: "Contradictory fixture counts",
          observations: [ { product_id: @product.id.to_s } ], request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(32))
        ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
      end
    end
    assert_match(/accepted packages must match receipt postings/, error.message)
    assert_nil @shipment.reload.reconciliation
    assert_equal BigDecimal("14.5"), receipt.lines.sole.batch.quantity
  end

  test "zero stock reconciliation still requires an active authorized actor" do
    @actor.update!(active: false)
    assert_raises(ArgumentError) do
      receive(input: @input.merge(amount: "0"), reconciliation: { rejected_packages: "2", exception: "temperature" })
    end
    assert_nil @shipment.reload.reconciliation
    assert_empty @product.batches
  end

  test "delivery intake subtracts pending allocations without double counting received packages" do
    read = -> { Clinic::Inventory::InventoryWire.delivery_intake(practice: @practice, actor: @actor, purchase_order_id: @order.id) }
    line = read.call.fetch(:selected_order).fetch(:lines).sole
    assert_equal "2.0", line.fetch(:allocated_packages)
    assert_equal "0.0", line.fetch(:received_packages)
    assert_equal "1.0", line.fetch(:available_packages)
    assert_equal "7.25", line.fetch(:units_per_package)

    receive
    line = read.call.fetch(:selected_order).fetch(:lines).sole
    assert_equal "0.0", line.fetch(:allocated_packages)
    assert_equal "2.0", line.fetch(:received_packages)
    assert_equal "1.0", line.fetch(:available_packages)
  end

  test "a canceled purchase order cannot receive its previously delivered shipment" do
    @order.update!(status: "cancelled")

    assert_no_difference "Clinic::Inventory::Receipt.count" do
      error = assert_raises(ArgumentError) { receive }
      assert_match(/Only sent or partially received/, error.message)
    end
    assert_equal 0, @order_line.reload.received_quantity
    assert_empty @product.batches
  end

  test "delivery intake pages open orders and selects exact tenant scoped records outside the page" do
    Clinic::Inventory::ReceivingQuery::PAGE_SIZE.times { order_for(@practice) }
    other_practice = Clinic::Practice.create!(name: "Other intake clinic")
    other_actor = User.create!(email_address: "other-intake@example.invalid", password: SecureRandom.hex(20))
    other_practice.memberships.create!(user: other_actor)
    other_order = order_for(other_practice, actor: other_actor)

    result = Clinic::Inventory::ReceivingQuery.intake(practice: @practice, purchase_order_id: @order.id)
    assert_equal Clinic::Inventory::ReceivingQuery::PAGE_SIZE, result.orders.length
    assert_equal 2, result.page_count
    assert_equal 26, result.total_count
    assert_not_includes result.orders.map(&:id), @order.id
    assert_equal @order.id, result.selected.id
    searched = Clinic::Inventory::ReceivingQuery.intake(practice: @practice, query: @product.name)
    assert_equal [ @order.id ], searched.orders.map(&:id)
    assert_raises(ActiveRecord::RecordNotFound) do
      Clinic::Inventory::ReceivingQuery.intake(practice: @practice, purchase_order_id: other_order.id)
    end

    receive(input: @input.merge(amount: "0"), reconciliation: { missing_packages: "2", exception: "short_delivery" })
    line = Clinic::Inventory::InventoryWire.delivery_intake(practice: @practice, actor: @actor, purchase_order_id: @order.id)
      .fetch(:selected_order).fetch(:lines).sole
    assert_equal "0.0", line.fetch(:allocated_packages)
    assert_equal "3.0", line.fetch(:available_packages)
  end

  private

  def order_for(practice, actor: @actor)
    practice.inventory_purchase_orders.create!(actor: actor, number: "PO-#{SecureRandom.hex(4)}", status: "sent",
      destination: "Shelf", reason: "Fixture delivery", request_key: SecureRandom.uuid,
      payload_digest: SecureRandom.hex(16), version: 1, subtotal: 3, tax: 0, shipping: 0, total: 3)
  end

  def receive(order: @order, shipment: @shipment, input: @input, key: SecureRandom.uuid, reconciliation: nil)
    Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, purchase_order: order,
      shipment: shipment, lines: [ input ], reason: "Fixture delivery", request_key: key, reconciliation: reconciliation)
  end
end
