require "test_helper"

class InventoryActivityTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    password = SecureRandom.hex(24)
    @actor = User.create!(email_address: "activity-fixture@example.invalid", password: password)
    @practice = Clinic::Practice.create!(name: "Activity query fixture")
    @membership = @practice.memberships.create!(user: @actor)
    grant_permissions!(@membership, "inventory.read", "inventory.receive", "inventory.adjust")
    product = @practice.pharmacy_products.create!(name: "Activity fixture liquid", sku: "ACTIVITY", stock_unit: "mL", quantity_scale: 3, package_size: "1.25", unit_reference: "Fixture package")
    @practice.inventory_locations.create!(name: "Fixture shelf", kind: "storage")
    receipt = Clinic::Inventory::Receiving.call(practice: @practice, actor: @actor, reason: "Old opening needle 100%", request_key: SecureRandom.uuid,
      lines: [ { product_id: product.id, lot_number: "ACTIVITY-LOT", location: "Fixture shelf", expires_on: "2099-01-01", amount: "2", input_unit: "package" } ])
    @receipt_id = receipt.id
    @batch = product.batches.sole
    get "/api/csrf", headers: @headers
    post "/api/session", params: { email_address: @actor.email_address, password: password },
      headers: @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token")), as: :json
    assert_response :success
  end

  test "pages full ledger with bounded records and searches beyond the old 200 row cap" do
    204.times { |index| @batch.move!(kind: "adjustment_in", amount: "0.125", reason: "Fixture adjustment #{index}", actor: @actor, request_key: SecureRandom.uuid) }
    expected_ids = @batch.movements.order(id: :desc).pluck(:id).map(&:to_s)
    classes = Hash.new(0)
    subscriber = ->(_name, _start, _finish, _id, payload) { classes[payload[:class_name]] += payload[:record_count] }
    ActiveSupport::Notifications.subscribed(subscriber, "instantiation.active_record") { read_page }
    first = response.parsed_body.fetch("data")
    assert_equal 205, first.dig("activity_page", "total_count")
    assert_equal 50, first.fetch("movements").length
    assert_operator classes["Clinic::Inventory::PharmacyMovement"], :>, 0
    assert_operator classes["Clinic::Inventory::PharmacyMovement"], :<=, 51
    %w[products lots balances supplier_products purchase_orders recalls receipts audit_events].each { |key| assert_not first.key?(key) }
    %w[Clinic::Inventory::SupplierProduct Clinic::Inventory::PurchaseOrder Clinic::Inventory::PharmacyProduct].each { |name| assert_equal 0, classes[name] }
    assert_equal "0.125", first.fetch("movements").first.fetch("quantity_units")
    assert_equal "ACTIVITY-LOT", first.fetch("movements").first.fetch("lot_number")
    assert_equal "Fixture shelf", first.fetch("movements").first.fetch("location_name")
    assert_equal "mL", first.fetch("movements").first.fetch("stock_unit")

    @batch.move!(kind: "adjustment_in", amount: "1", reason: "Concurrent fixture insertion", actor: @actor, request_key: SecureRandom.uuid)
    ids = first.fetch("movements").pluck("id")
    cursor = first.dig("activity_page", "next_cursor")
    while cursor
      read_page(before: cursor)
      page = response.parsed_body.fetch("data")
      assert_operator page.fetch("movements").length, :<=, 50
      ids.concat(page.fetch("movements").pluck("id"))
      cursor = page.dig("activity_page", "next_cursor")
    end
    assert_equal expected_ids, ids
    assert_equal ids.length, ids.uniq.length

    read_page(q: "old opening NEEDLE")
    assert_equal 1, response.parsed_body.dig("data", "activity_page", "filtered_count")
    assert_equal "2.5", response.parsed_body.dig("data", "movements").sole.fetch("quantity_units")
    read_page(q: "receipt_#{@receipt_id}")
    assert_equal 1, response.parsed_body.dig("data", "movements").length
    read_page(q: "%")
    assert_equal 1, response.parsed_body.dig("data", "activity_page", "filtered_count"), "Search wildcard must remain literal"
    read_page(q: "No fixture matches")
    assert_empty response.parsed_body.dig("data", "movements")
    assert_equal 206, response.parsed_body.dig("data", "activity_page", "total_count")
  end

  test "rejects malformed cursors and oversized filters without changing history" do
    [ "-1", "1.5", "0", "99999999999999999999", "1 OR 1=1" ].each do |cursor|
      get "/api/clinic/inventory/activity", params: { view: "ledger", before: cursor }, headers: @headers
      assert_response :unprocessable_entity
    end
    get "/api/clinic/inventory/activity", params: { view: "ledger", q: "a" * 101 }, headers: @headers
    assert_response :unprocessable_entity
    assert_equal 1, @batch.movements.count
  end

  test "records signed corrections with a reason and returns an exact summary" do
    before_quantity = @batch.quantity
    post "/api/clinic/inventory/lots/#{@batch.lot_id}/adjust", params: {
      adjustment: { lot_id: @batch.lot_id, location_id: @batch.location_id, delta_units: "-1.250",
        reason: "Damaged fixture stock", request_key: SecureRandom.uuid }
    }, headers: csrf_headers, as: :json
    assert_response :success

    summary = response.parsed_body.fetch("adjustment")
    assert_equal "-1.25", summary.fetch("delta_units")
    assert_equal "Damaged fixture stock", summary.fetch("reason")
    assert_equal "1.25", summary.fetch("resulting_on_hand_units")
    assert_equal before_quantity - BigDecimal("1.25"), @batch.reload.quantity

    before_movements = @batch.movements.count
    post "/api/clinic/inventory/lots/#{@batch.lot_id}/adjust", params: {
      adjustment: { lot_id: @batch.lot_id, location_id: @batch.location_id, delta_units: "1",
        reason: " ", request_key: SecureRandom.uuid }
    }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_includes response.parsed_body.fetch("error"), "reason"
    assert_equal before_movements, @batch.movements.count
  end

  test "read scope ignores a supplied practice and rechecks permission" do
    other = Clinic::Practice.create!(name: "Other activity fixture")
    read_page(practice_id: other.id)
    assert_equal @practice.id, response.parsed_body.dig("data", "practice", "id")
    assert_equal 1, response.parsed_body.dig("data", "activity_page", "total_count")
    other_read = Clinic::Inventory::ActivityQuery.call(practice: other)
    assert_equal 0, other_read.total_count
    assert_empty other_read.movements

    get "/api/clinic/inventory/activity", headers: @headers
    assert_response :success
    assert response.parsed_body.fetch("data").key?("products"), "Legacy callers retain their full projection"
    assert_not response.parsed_body.fetch("data").key?("activity_page")

    set_permission!(@membership, "inventory.read", false)
    get "/api/clinic/inventory/activity", params: { view: "ledger" }, headers: @headers
    assert_response :forbidden
    assert_not response.parsed_body.key?("data")
  end

  private

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def read_page(**params)
    get "/api/clinic/inventory/activity", params: params.merge(view: "ledger"), headers: @headers
    assert_response :success
  end
end
