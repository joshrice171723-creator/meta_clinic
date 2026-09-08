require "test_helper"

class Clinic::Inventory::ReplenishmentQueryTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "replenishment-qa@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Replenishment QA clinic")
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "inventory.read", "inventory.receive", "procurement.create")
    @practice.inventory_locations.create!(name: "QA shelf", kind: "storage")
    @supplier = @practice.inventory_suppliers.create!(name: "Replenishment QA supplier")
    @product = @practice.pharmacy_products.create!(
      name: "Replenishment QA item", sku: "REPLENISH-QA", ndc: "12345678901",
      stock_unit: "each", quantity_scale: 0, package_size: 10,
      unit_reference: "Package of 10", reorder_point: 239
    )
    @offer = @supplier.supplier_products.create!(
      practice: @practice, product: @product, ndc: @product.ndc,
      supplier_sku: "REPLENISH-OFFER", description: @product.name,
      ordering_unit: "package", currency: "USD", contract_status: "active",
      package_quantity: 8, wholesale_unit_cost: 5, available: true,
      effective_date: Date.current, imported_at: Time.current
    )
    Clinic::Inventory::Receiving.call(
      practice: @practice, actor: @actor, reason: "Replenishment QA opening stock",
      request_key: SecureRandom.uuid,
      lines: [ { product_id: @product.id, lot_number: "REPLENISH-QA-LOT",
        location: "QA shelf", expires_on: (Date.current + 1.year).iso8601,
        amount: "1", input_unit: "package" } ]
    )
  end

  test "uses the complete outstanding supply set and keeps pending orders and draft cart separate" do
    101.times { create_order(status: "sent", ordered: 1, received: 0, conversion: 2) }
    create_order(status: "partially_received", ordered: 4, received: 1, conversion: 2)
    create_order(status: "draft", ordered: 5, received: 1, conversion: 3)
    create_order(status: "approved", ordered: 2, received: 0, conversion: 4)
    create_order(status: "sent", ordered: 5, received: 0, conversion: 7, stock_unit: "tablet")
    %w[rejected complete cancelled].each do |status|
      create_order(status: status, ordered: 50, received: 0, conversion: 10)
    end
    create_draft_cart(requested_packages: 3)

    wire = Clinic::Inventory::InventoryWire.replenishment(practice: @practice, actor: @actor, mode: "needed")
    explanation = wire.fetch(:explanations).fetch(@product.id.to_s)

    assert_equal 1, wire.dig(:plan_page, :total_count)
    assert_equal 1, wire.dig(:plan_page, :filtered_count)
    assert_equal BigDecimal("10"), explanation.fetch(:available_units).to_d
    assert_equal BigDecimal("208"), explanation.fetch(:incoming_units).to_d
    assert_equal BigDecimal("20"), explanation.fetch(:pending_order_units).to_d
    assert_equal BigDecimal("3"), explanation.fetch(:draft_cart_packages).to_d
    assert_equal 1, explanation.fetch(:unit_mismatch_count)
    assert_equal BigDecimal("21"), explanation.fetch(:shortage_units).to_d
    assert_equal "3", explanation.fetch(:suggested_packages)
    assert_equal BigDecimal("30"), explanation.fetch(:rounded_units).to_d
    assert_equal "4", explanation.dig(:offer, :supplier_packages)
    assert_equal BigDecimal("30"), explanation.dig(:offer, :desired_units).to_d
    assert_equal BigDecimal("2"), explanation.dig(:offer, :overage_units).to_d
    assert_equal BigDecimal("20"), explanation.dig(:offer, :total_cost).to_d
  end

  private

  def create_order(status:, ordered:, received:, conversion:, stock_unit: @product.stock_unit)
    order = @practice.inventory_purchase_orders.create!(
      actor: @actor, supplier: @supplier, number: "PO-QA-#{SecureRandom.hex(6)}",
      status: status, destination: "QA shelf", reason: "Replenishment QA",
      request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16), version: 1,
      subtotal: 0, tax: 0, shipping: 0, total: 0, currency: "USD"
    )
    order.lines.create!(
      practice: @practice, product: @product, product_name: @product.name,
      stock_unit: stock_unit, input_unit: "package", ordered_quantity: ordered,
      received_quantity: received, conversion_factor: conversion, unit_price: 1,
      currency: "USD"
    )
    order
  end

  def create_draft_cart(requested_packages:)
    selection = Clinic::Inventory::PurchaseCartCheckout.select_offer(
      product: @product, requested_packages: requested_packages.to_s
    )
    cart = Clinic::Inventory::PurchaseCart.create!(
      practice: @practice, actor: @actor, status: "draft", reason: "Replenishment QA cart"
    )
    cart.items.create!(
      practice: @practice, product: @product, requested_packages: requested_packages,
      input_unit: "package", selected_currency: selection.supplier_product.currency,
      source: "replenishment", status: "draft", conversion_factor: @product.package_size,
      selected_unit_price: selection.supplier_product.wholesale_unit_cost,
      selected_package_quantity: selection.supplier_product.package_quantity,
      selected_supplier_product: selection.supplier_product, selected_supplier: selection.supplier,
      price_snapshot_at: selection.captured_at, price_snapshot_digest: selection.digest
    )
  end
end
