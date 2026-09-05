require "test_helper"

class ClinicSupplierPricingTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "supplier-pricing-test@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    grant_supplier_pricing_role!(@membership)
    @product = @practice.pharmacy_products.create!(
      name: "Supplier priced tablet", sku: "SUPPLIER-PRICE-001", ndc: "12345678901",
      stock_unit: "tablet", quantity_scale: 0, package_size: 90, unit_reference: "Bottle of 90 tablets"
    )
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "supplier prices preview, import, and become the preferred PO default" do
    post "/api/clinic/inventory/suppliers", params: { supplier: { name: "Acme Medical Supply" } }, headers: csrf_headers, as: :json
    assert_response :created
    supplier_id = response.parsed_body.fetch("data").fetch("suppliers").find { |supplier| supplier.fetch("name") == "Acme Medical Supply" }.fetch("id")

    csv = <<~CSV
      ndc,vendor_sku,description,package_qty,wholesale_cost,effective_date
      12345-6789-01,ACME-001,Supplier priced tablet bottle,90,12.50,2026-09-01
      not-an-ndc,ACME-BAD,Bad row,90,1.00,2026-09-01
      00000-0000-00,ACME-UNKNOWN,Unmatched item,90,9.50,2026-09-01
    CSV
    post "/api/clinic/inventory/suppliers/preview", params: { supplier_id:, csv: }, headers: csrf_headers, as: :json
    assert_response :success
    preview = response.parsed_body.fetch("preview")
    assert_equal 3, preview.fetch("total_rows")
    assert_equal 2, preview.fetch("rows").length
    assert_equal true, preview.fetch("rows").first.fetch("matched")
    assert_equal 1, preview.fetch("errors").length
    assert_equal [ "00000000000" ], preview.fetch("unmatched_ndcs")

    post "/api/clinic/inventory/suppliers/import", params: { supplier_id:, csv:, include_lines: [ 2 ] }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal 1, response.parsed_body.fetch("imported")
    offer = Clinic::Inventory::SupplierProduct.where(practice_id: @practice.id).find_by!(supplier_id:, supplier_sku: "ACME-001")
    assert_equal @product.id, offer.product_id
    assert_equal "12.5", offer.wholesale_unit_cost.to_d.to_s("F")

    patch "/api/clinic/inventory/products/#{@product.id}/preferred-supplier", params: { supplier_id: }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal supplier_id, response.parsed_body.fetch("data").fetch("products").find { |product| product.fetch("id") == @product.id.to_s }.fetch("preferred_supplier_id")

    submit_purchase_order(supplier_id, "12.50")
    order = @practice.inventory_purchase_orders.order(id: :desc).first
    assert_equal "12.5", order.lines.sole.unit_price.to_d.to_s("F")

    updated_csv = csv.sub("12.50", "14.00")
    post "/api/clinic/inventory/suppliers/import", params: { supplier_id:, csv: updated_csv, include_lines: [ 2 ] }, headers: csrf_headers, as: :json
    assert_response :success
    assert_equal "14.0", offer.reload.wholesale_unit_cost.to_d.to_s("F")
    assert_equal "12.5", order.lines.sole.reload.unit_price.to_d.to_s("F")
  end

  test "supplier pricing endpoints reject accounts outside the approved roles" do
    grant = @membership.role_grants.joins(:role_version).find_by!(role_versions: { role_code: "dev-seed-inventory" })
    grant.update!(revoked_at: Time.current, revision: grant.revision + 1)

    post "/api/clinic/inventory/suppliers", params: { supplier: { name: "Blocked Supply" } }, headers: csrf_headers, as: :json
    assert_response :forbidden
    assert_not Clinic::Inventory::Supplier.exists?(practice_id: @practice.id, name: "Blocked Supply")
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit_purchase_order(supplier_id, unit_price)
    post "/api/clinic/inventory/purchase-orders", params: {
      purchase_order: {
        request_key: SecureRandom.uuid,
        supplier_id:, destination: "Main Pharmacy", reason: "Supplier pricing test",
        lines: [ { product_id: @product.id, quantity: "1", unit_price:, currency: "USD" } ]
      }
    }, headers: csrf_headers, as: :json
    assert_response :created
  end

  def grant_supplier_pricing_role!(membership)
    role = RoleVersion.find_or_create_by!(role_code: "dev-seed-inventory", version: 1)
    %w[inventory.read inventory.catalog].each do |action_code|
      permission = Permission.find_or_create_by!(action_code: action_code)
      RoleVersionPermission.find_or_create_by!(role_version: role, permission: permission)
    end
    membership.role_grants.create!(practice: membership.practice, role_version: role, scope_kind: "practice", effective_from: 1.minute.ago, revision: 1)
  end
end
