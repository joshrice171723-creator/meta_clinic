require "test_helper"

class Clinic::Inventory::PurchaseCartCheckoutOfferSelectionTest < ActiveSupport::TestCase
  setup do
    @actor = User.create!(email_address: "offer-selection-qa@example.invalid", password: SecureRandom.hex(20))
    @practice = Clinic::Practice.create!(name: "Offer selection QA clinic")
    membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(membership, "inventory.catalog")
    @product = @practice.pharmacy_products.create!(
      name: "Offer selection QA item", sku: "OFFER-QA", ndc: "23456789012",
      stock_unit: "each", quantity_scale: 0, package_size: 10,
      unit_reference: "Package of 10"
    )
  end

  test "requires confirmed availability and an active contract even for the preferred supplier" do
    unknown = create_offer(name: "Unknown availability", available: nil, cost: 1)
    inactive = create_offer(name: "Inactive contract", contract_status: "expired", cost: 1)
    eligible = create_offer(name: "Eligible supplier", cost: 9)
    @product.update_catalog!({ preferred_supplier_id: inactive.supplier_id }, actor: @actor)

    selected = select_offer

    assert_equal eligible, selected.supplier_product
    assert_equal "Availability is not confirmed.", unknown.purchase_eligibility_reason(on: Date.current)
    assert_equal "The supplier contract is not active.", inactive.purchase_eligibility_reason(on: Date.current)
  end

  test "rejects multiple eligible currencies but ignores currencies on ineligible offers" do
    usd = create_offer(name: "USD supplier", currency: "USD", cost: 7)
    create_offer(name: "Unknown CAD supplier", currency: "CAD", available: nil, cost: 1)

    assert_equal usd, select_offer.supplier_product

    create_offer(name: "Eligible CAD supplier", currency: "CAD", cost: 6)
    error = assert_raises(ArgumentError) { select_offer }
    assert_match(/multiple currencies/i, error.message)
  end

  test "ranks the whole payable package total before normalized unit cost" do
    lower_unit_cost = create_offer(name: "Lower unit cost", package_quantity: 6, cost: 4)
    lower_total = create_offer(name: "Lower payable total", package_quantity: 10, cost: 7)

    selected = select_offer

    assert_operator lower_unit_cost.wholesale_unit_cost / lower_unit_cost.package_quantity, :<,
      lower_total.wholesale_unit_cost / lower_total.package_quantity
    assert_equal lower_total, selected.supplier_product
    assert_equal 1, selected.supplier_packages
    assert_equal BigDecimal("7"), selected.total_cost
    assert_equal BigDecimal("0"), selected.overage_units
  end

  test "uses overage then preferred supplier and stable id to break equal-total ties" do
    lower_overage = create_offer(name: "Lower overage", package_quantity: 6, cost: 4, lead_time_days: 3)
    create_offer(name: "Higher overage", package_quantity: 8, cost: 4, lead_time_days: 3)
    same_rank = create_offer(name: "Same rank", package_quantity: 6, cost: 4, lead_time_days: 3)

    assert_equal lower_overage, select_offer.supplier_product

    @product.update_catalog!({ preferred_supplier_id: same_rank.supplier_id }, actor: @actor)
    assert_equal same_rank, select_offer.supplier_product

    @product.update_catalog!({ preferred_supplier_id: nil }, actor: @actor)
    assert_equal lower_overage, select_offer.supplier_product
  end

  test "quote fee evidence changes the offer digest but never the merchandise total or ranking" do
    offer = create_offer(name: "Quoted supplier", cost: 7)
    offer.update!(price_source: "manual_quote", quote_reference: "SYN-FEE", quoted_on: Date.current,
      quoted_fee_amount: 2, quoted_fee_currency: "USD", quoted_fee_basis: "Entire quoted shipment")
    captured = select_offer
    assert_equal BigDecimal("7"), captured.total_cost
    offer.update!(quoted_fee_amount: 3)
    refreshed = select_offer
    assert_not_equal captured.digest, refreshed.digest
    assert_equal captured.total_cost, refreshed.total_cost
    assert_equal offer, refreshed.supplier_product
  end

  private

  def select_offer
    Clinic::Inventory::PurchaseCartCheckout.select_offer(product: @product, requested_packages: "1")
  end

  def create_offer(name:, package_quantity: 10, cost:, currency: "USD", available: true,
    contract_status: "active", lead_time_days: nil)
    supplier = @practice.inventory_suppliers.create!(name: name)
    supplier.supplier_products.create!(
      practice: @practice, product: @product, ndc: @product.ndc,
      supplier_sku: "OFFER-#{SecureRandom.hex(4)}", description: name,
      ordering_unit: "package", currency: currency, contract_status: contract_status,
      package_quantity: package_quantity, wholesale_unit_cost: cost, available: available,
      lead_time_days: lead_time_days, effective_date: Date.current, imported_at: Time.current
    )
  end
end
