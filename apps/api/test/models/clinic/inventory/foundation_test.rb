require "test_helper"

class Clinic::Inventory::FoundationTest < ActiveSupport::TestCase
  setup do
    @user = User.create!(email_address: "foundation@example.invalid", password: SecureRandom.hex(20))
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @product = Clinic::Inventory::PharmacyProduct.create!(practice: @practice, name: "Fictional liquid", sku: "LIQ", stock_unit: "mL", quantity_scale: 3, package_size: "10.5", unit_reference: "Synthetic package specification v1")
    @line = { product_id: @product.id, lot_number: "LOT", location: "Shelf", expires_on: (Date.current + 90).iso8601, amount: "2", input_unit: "package" }
  end

  def receive(lines: [ @line ], key: SecureRandom.uuid, supplier: "Synthetic supplier")
    Clinic::Inventory::Receiving.call(practice: @practice, actor: @user, lines: lines, reason: "Synthetic delivery", request_key: key, supplier: supplier)
  end

  def reject_sql(&block)
    assert_raises(ActiveRecord::StatementInvalid) { ApplicationRecord.transaction(requires_new: true, &block) }
  end

  test "repeated lots preserve separate supplier cost and unit evidence and exact retries" do
    key = SecureRandom.uuid
    first = receive(lines: [ @line.merge(unit_cost: "12.3456", currency: "USD") ], key: key)
    assert_equal first, receive(lines: [ @line.merge(unit_cost: "12.3456", currency: "USD") ], key: key)
    second = receive(lines: [ @line.merge(amount: "0.125", input_unit: "mL") ], supplier: "Second supplier")
    assert_equal first.lines.sole.batch_id, second.lines.sole.batch_id
    assert_equal BigDecimal("21.125"), @product.batches.sole.quantity
    assert_equal BigDecimal("12.3456"), first.lines.sole.unit_cost
    assert_nil second.lines.sole.unit_cost
    assert_not_equal first.supplier_id, second.supplier_id
    assert_raises(ArgumentError) { receive(key: key) }
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "inventory wire preserves fractional quantities as decimal strings" do
    receive(lines: [ @line.merge(amount: "0.125", input_unit: "mL") ])
    Clinic::Inventory::Count.observe!(batch: @product.batches.sole, actor: @user, observed: "0.100", reason: "Fractional check", request_key: SecureRandom.uuid)
    wire = Clinic::Inventory::InventoryWire.call(practice: @practice, actor: @user)

    assert_equal "10.5", wire.fetch(:products).sole.fetch(:units_per_package)
    assert_equal "0.125", wire.fetch(:products).sole.fetch(:on_hand_units)
    assert_equal "0.125", wire.fetch(:balances).sole.fetch(:on_hand_units)
    assert_equal "0.125", wire.fetch(:movements).sole.fetch(:quantity_units)
    assert_equal "0.1", wire.fetch(:controlled_reconciliations).sole.fetch(:counted_units)
    assert_nil wire[:cycle_counts]
    assert_equal "-0.025", wire.fetch(:controlled_reconciliations).sole.fetch(:variance_units)
  end

  test "inventory wire exposes only recorded supplier links and receipt areas" do
    supplier_name = "Supplier with a name collision"
    receive(lines: [ @line.merge(area_id: "shelf-a") ], supplier: supplier_name)
    supplier = Clinic::Inventory::Supplier.find_by!(practice: @practice, name: supplier_name)
    wire = Clinic::Inventory::InventoryWire.call(practice: @practice, actor: @user)

    product = wire.fetch(:products).sole
    assert_equal supplier.id.to_s, product.fetch(:preferred_supplier_id)
    assert_equal supplier.name, product.fetch(:preferred_supplier)
    location = wire.fetch(:locations).sole
    assert_equal [ "shelf-a" ], location.fetch(:areas)
  end

  test "shipment receipt is line-bound, single-use, and transitions atomically" do
    order = @practice.inventory_purchase_orders.create!(actor: @user, number: "PO-SHIP-001", status: "sent",
      destination: "Shelf", reason: "Synthetic shipment", request_key: SecureRandom.uuid,
      payload_digest: SecureRandom.hex(16), version: 1, subtotal: 21, tax: 0, shipping: 0, total: 21)
    line = order.lines.create!(practice: @practice, product: @product, product_name: @product.name,
      stock_unit: @product.stock_unit, input_unit: "package", ordered_quantity: 2,
      received_quantity: 0, conversion_factor: @product.package_size, unit_price: 1, currency: "USD")
    shipment = order.shipments.create!(practice: @practice, actor: @user, reference: "SHIP-SINGLE-001",
      supplier_reference: "SYN-SUPPLIER-001", status: "delivered", package_count: 2, expected_units: 21,
      delivered_at: Time.current, request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16))
    shipment.shipment_lines.create!(practice: @practice, purchase_order_line: line, expected_packages: 2)
    second_line = order.lines.create!(practice: @practice, product: @product, product_name: @product.name,
      stock_unit: @product.stock_unit, input_unit: "package", ordered_quantity: 1,
      received_quantity: 0, conversion_factor: @product.package_size, unit_price: 1, currency: "USD")
    assert_raises(ActiveRecord::RecordInvalid) do
      shipment.shipment_lines.create!(practice: @practice, purchase_order_line: second_line, expected_packages: 1)
    end
    input = @line.merge(amount: "2", input_unit: "package", purchase_order_line_id: line.id)
    key = SecureRandom.uuid

    receipt = Clinic::Inventory::Receiving.call(practice: @practice, actor: @user, shipment: shipment,
      purchase_order: order, lines: [ input ], reason: "Synthetic delivered shipment", request_key: key)

    assert_equal "received", shipment.reload.effective_status
    assert_equal receipt, Clinic::Inventory::Receiving.call(practice: @practice, actor: @user, shipment: shipment,
      purchase_order: order, lines: [ input ], reason: "Synthetic delivered shipment", request_key: key)
    assert_raises(ArgumentError) do
      Clinic::Inventory::Receiving.call(practice: @practice, actor: @user, shipment: shipment,
        purchase_order: order, lines: [ input ], reason: "Synthetic delivered shipment", request_key: SecureRandom.uuid)
    end
    assert_equal 1, shipment.receipts.count
    assert_raises(ArgumentError) do
      Clinic::Inventory::Receiving.call(practice: @practice, actor: @user, shipment: shipment,
        purchase_order: order, lines: [ input.merge(product_id: @practice.pharmacy_products.create!(name: "Other", sku: "OTHER", stock_unit: "mL", quantity_scale: 3, package_size: 1, unit_reference: "Synthetic").id) ],
        reason: "Synthetic mismatched line", request_key: SecureRandom.uuid)
    end
  end

  test "normal receipts reject quarantine and returns locations" do
    location = @practice.inventory_locations.create!(name: "Arbitrary Safety Room", kind: "quarantine")
    lot = Clinic::Inventory::Lot.create!(practice: @practice, product: @product,
      number: @line.fetch(:lot_number), expires_on: Date.iso8601(@line.fetch(:expires_on)))
    assert_raises(ArgumentError) do
      receive(lines: [ @line.merge(location: location.name) ])
    end
    assert_empty @product.batches.where(location_id: location.id)

    recall = @practice.inventory_recalls.create!(product: @product, actor: @user, reference: "RECALL-SAFETY-001",
      status: "disposition_pending", reason: "Synthetic safety recall", required_disposition: "return_to_supplier",
      effective_on: Date.current, affected_units: 2, request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16))
    recall.recall_lots.create!(practice: @practice, lot: lot)
    receiver = User.create!(email_address: "receiving-safety@example.invalid", password: SecureRandom.hex(20))
    receiver_membership = @practice.memberships.create!(user: receiver)
    grant_permissions!(receiver_membership, "inventory.receive", "recall.lock")
    assert_raises(ArgumentError) do
      Clinic::Inventory::Receiving.call(practice: @practice, actor: receiver, recall: recall, status: "quarantined",
        lines: [ @line ], reason: "Synthetic misplaced recall", request_key: SecureRandom.uuid)
    end
    Clinic::Inventory::Receiving.call(practice: @practice, actor: receiver, recall: recall, status: "quarantined",
      lines: [ @line.merge(location: location.name) ], reason: "Synthetic recall quarantine", request_key: SecureRandom.uuid)
    held_batch = @product.batches.find_by!(location_id: location.id)
    assert_not held_batch.available?
  end

  test "multi-line failures roll back the whole delivery and refuse ambiguous quantities" do
    [ "NaN", "Infinity", "1e2", "0.0001", "-1" ].each do |amount|
      assert_raises(ArgumentError) { receive(lines: [ @line, @line.merge(amount: amount, input_unit: "mL") ]) }
      assert_equal 0, @product.batches.count
      assert_equal 0, Clinic::Inventory::Receipt.where(practice_id: @practice.id).count
    end
    receive
    batch = @product.batches.sole
    attributes = batch.movements.sole.attributes.except("id").merge("kind" => "adjustment_in", "receipt_line_id" => nil, "quantity" => "0.0001", "request_key" => SecureRandom.uuid)
    reject_sql { Clinic::Inventory::PharmacyMovement.insert_all!([ attributes ]) }
    reject_sql { batch.update_columns(on_hand: 99) }
    reject_sql { @practice.items.create!(name: "Bypass", sku: "BYPASS", quantity: 10) }
    assert_equal 21, batch.reload.quantity
  end

  test "overlapping holds release independently and retry checks retain the selected hold" do
    receive
    batch = @product.batches.sole
    batch.change_status!(status: "recalled", reason: "Synthetic recall", actor: @user, request_key: SecureRandom.uuid)
    batch.change_status!(status: "temperature", reason: "Synthetic excursion", actor: @user, request_key: SecureRandom.uuid)
    recall, temperature = batch.active_holds.order(:id).to_a
    key = SecureRandom.uuid
    event = batch.change_status!(status: "active", hold_id: temperature.id, reason: "Reviewed excursion", actor: @user, request_key: key)
    assert_equal event, batch.change_status!(status: "active", hold_id: temperature.id, reason: "Reviewed excursion", actor: @user, request_key: key)
    assert_raises(ArgumentError) { batch.change_status!(status: "active", hold_id: recall.id, reason: "Reviewed excursion", actor: @user, request_key: key) }
    assert_equal "recalled", batch.status
    assert_equal 0, @product.available_quantity
    assert_equal 21, batch.quantity
  end

  test "count approval posts only the variance once and cannot clear a hold or apply a stale count" do
    receive
    batch = @product.batches.sole
    batch.change_status!(status: "quarantined", reason: "Synthetic hold", actor: @user, request_key: SecureRandom.uuid)
    count = Clinic::Inventory::Count.observe!(batch: batch, actor: @user, observed: "20.125", reason: "Physical count", request_key: SecureRandom.uuid)
    approval = count.approve!(actor: @user)
    assert_equal approval, count.approve!(actor: @user)
    assert_equal BigDecimal("20.125"), batch.reload.quantity
    assert_equal 0, @product.available_quantity
    assert_equal BigDecimal("-0.875"), batch.movements.find(approval.entry_id).quantity
    stale = Clinic::Inventory::Count.observe!(batch: batch, actor: @user, observed: "20", reason: "Another count", request_key: SecureRandom.uuid)
    batch.move!(kind: "adjustment_out", amount: "1", reason: "Synthetic loss", actor: @user, request_key: SecureRandom.uuid)
    assert_raises(ArgumentError) { stale.approve!(actor: @user) }
    ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
  end

  test "action permissions and versioned suspension deny posting while history remains" do
    receive
    set_permission!(@membership, "inventory.receive", false)
    assert_raises(ArgumentError) { receive }
    @product.batches.sole.move!(kind: "adjustment_out", amount: "1", reason: "Permitted loss", actor: @user, request_key: SecureRandom.uuid)
    profile = Clinic::Inventory::Profile.revise!(practice: @practice, actor: @user, status: "suspended", reason: "Synthetic suspension")
    assert_equal 2, profile.version
    assert_raises(ArgumentError) { @product.batches.sole.move!(kind: "adjustment_out", amount: "1", reason: "Denied", actor: @user, request_key: SecureRandom.uuid) }
    assert_equal 20, @product.batches.sole.quantity
    reject_sql { profile.delete }
  end

  test "catalog updates retain metadata attribution and immutable unit definitions" do
    @product.update_catalog!({ reorder_point: 3 }, actor: @user)
    event = ApplicationRecord.connection.select_one("SELECT actor_id,changed_fields,profile_id FROM clinic_inventory_catalog_events WHERE product_id=#{@product.id}")
    assert_equal @user.id, event["actor_id"]
    assert_equal "{reorder_point}", event["changed_fields"]
    assert event["profile_id"]
    reject_sql { @product.update_columns(package_size: 9) }
    reject_sql { @product.update_columns(active: false) }
    reject_sql { @product.update_catalog!({ package_size: 20 }, actor: @user) }
    assert ApplicationRecord.connection.select_value("SELECT current_setting('apply.inventory_actor', true)").blank?
    reject_sql { @product.batches.create!(practice_id: @practice.id, lot_number: "RAW", location: "Shelf", expires_on: Date.current, on_hand: 1) }
  end

  test "incomplete receipts cannot commit and missing currency is rejected" do
    receive
    row = Clinic::Inventory::Receipt.where(practice_id: @practice.id).sole
    reject_sql do
      Clinic::Inventory::Receipt.insert_all!([ row.attributes.except("id").merge("request_key" => SecureRandom.uuid) ])
      ApplicationRecord.connection.execute("SET CONSTRAINTS ALL IMMEDIATE")
    end
    reject_sql do
      Clinic::Inventory::ReceiptLine.insert_all!([ row.lines.sole.attributes.except("id").merge("unit_cost" => 1, "currency" => nil) ])
    end
  end

  test "an incompatible trigger context cannot substitute for the posting capability" do
    receive
    batch = @product.batches.sole
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "inventory.catalog")
    attributes = batch.movements.sole.attributes.except("id").merge(
      "kind" => "adjustment_out", "receipt_line_id" => nil, "quantity" => "1", "request_key" => SecureRandom.uuid
    )
    reject_sql do
      ApplicationRecord.connection.execute("SELECT set_config('apply.inventory_action', 'inventory.catalog', true)")
      Clinic::Inventory::PharmacyMovement.insert_all!([ attributes ])
    end
  end

  test "transfer-only actor can route stock to the seeded Returns Holding location" do
    receive
    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "inventory.transfer")
    destination = @practice.inventory_locations.create!(name: "Returns Holding", kind: "returns")
    transfer = Clinic::Inventory::TransferStock.call(practice: @practice, actor: @user,
      source_batch_id: @product.batches.sole.id, destination_location_id: destination.id,
      amount: "1", reason: "Synthetic transfer hold", request_key: SecureRandom.uuid)

    assert_equal BigDecimal("1"), transfer.quantity
    assert @product.batches.where(location_id: destination.id).sole.active_holds.exists?

    source_movement = @product.batches.find_by(location_id: @practice.inventory_locations.find_by!(name: "Shelf").id).movements.find_by(kind: "adjustment_out")
    reject_sql do
      Clinic::Inventory::PharmacyMovement.insert_all!([ source_movement.attributes.except("id").merge(
        "batch_id" => @product.batches.where(location_id: destination.id).sole.id,
        "request_key" => SecureRandom.uuid,
        "transfer_id" => transfer.id
      ) ])
    end
    reject_sql do
      Clinic::Inventory::PharmacyMovement.insert_all!([ source_movement.attributes.except("id").merge(
        "request_key" => SecureRandom.uuid
      ) ])
    end
  end
end
