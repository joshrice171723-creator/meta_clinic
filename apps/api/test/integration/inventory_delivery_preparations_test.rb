require "test_helper"

class InventoryDeliveryPreparationsTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "delivery-preparation@example.invalid", password: @password)
    @practice = Clinic::Practice.create!(name: "Synthetic delivery preparation clinic")
    @membership = Clinic::Membership.create!(practice: @practice, user: @user)
    %w[inventory.read procurement.read procurement.submit].each { |permission| grant_permissions!(@membership, permission) }
    @supplier = @practice.inventory_suppliers.create!(name: "Synthetic disconnected supplier")
    @product = @practice.pharmacy_products.create!(name: "Synthetic order item", sku: "SYN-PREP", ndc: "11111111111", stock_unit: "each", quantity_scale: 0, package_size: 10, unit_reference: "each")
    @order = @practice.inventory_purchase_orders.create!(actor: @user, supplier: @supplier,
      number: "SYN-PREP-1", status: "approved", version: 3, destination: "Synthetic pharmacy",
      destination_address: "100 Synthetic Street", reason: "Synthetic approved order",
      request_key: SecureRandom.uuid, payload_digest: "a" * 64, subtotal: 20, total: 20)
    @line = @order.lines.create!(practice: @practice, product: @product, product_name: @product.name,
      stock_unit: "each", input_unit: "package", ordered_quantity: 2, received_quantity: 0,
      conversion_factor: 10, unit_price: 10, currency: "USD", quote_reference: "SYN-QUOTE",
      quoted_on: @practice.inventory_date, quoted_fee_amount: "1.230001", quoted_fee_currency: "USD",
      quoted_fee_basis: "Entire quoted shipment")
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  test "preparation is durable immutable evidence and exact retry remains safe after a domain transition" do
    get endpoint
    assert_response :success
    source = response.parsed_body.fetch("data")
    assert_empty source.fetch("attempts")
    intent = intent_for(source)
    assert_difference "Clinic::Inventory::DeliveryPreparation.count", 1 do
      post endpoint, params: { preparation: intent }, headers: csrf_headers, as: :json
      assert_response :created
    end
    saved = response.parsed_body.fetch("data")
    assert_equal "approved", @order.reload.status
    assert_empty @order.events
    assert_equal "unknown", saved.fetch("delivery_outcome")
    assert_equal "disconnected", saved.fetch("connection_status")
    assert_equal "local_preparation", saved.fetch("source")
    assert_equal "1.230001", saved.dig("snapshot", "lines", 0, "quoted_fee_amount")
    assert_equal "Entire quoted shipment", saved.dig("snapshot", "lines", 0, "quoted_fee_basis")
    assert_equal "20.0", saved.dig("snapshot", "total")
    assert_equal @user.id.to_s, saved.fetch("actor_id")
    assert_match Clinic::Inventory::PrepareOrderDelivery::KEY, saved.fetch("attempt_id")
    assert saved.fetch("prepared_at").present?
    @order.transition!(to: "sent", actor: @user, reason: "Separately recorded manual event", request_key: SecureRandom.uuid)
    assert_no_difference "Clinic::Inventory::DeliveryPreparation.count" do
      post endpoint, params: { preparation: intent }, headers: csrf_headers, as: :json
      assert_response :created
    end
    assert_equal saved, response.parsed_body.fetch("data")
    get endpoint, params: { request_key: intent[:request_key] }
    assert_response :success
    assert_equal saved, response.parsed_body.dig("data", "recovered_attempt")
    assert_equal false, response.parsed_body.dig("data", "can_prepare")
    assert_not_equal saved.fetch("source_digest"), response.parsed_body.dig("data", "source_digest")
    assert_equal "unknown", response.parsed_body.dig("data", "attempts", 0, "delivery_outcome")
  end

  test "stale source changed intent and a different key for an existing version cannot create duplicate preparations" do
    get endpoint
    intent = intent_for(response.parsed_body.fetch("data"))
    post endpoint, params: { preparation: intent.merge(source_digest: "b" * 64) }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_empty Clinic::Inventory::DeliveryPreparation.where(practice: @practice)
    post endpoint, params: { preparation: intent }, headers: csrf_headers, as: :json
    assert_response :created
    assert_no_difference "Clinic::Inventory::DeliveryPreparation.count" do
      post endpoint, params: { preparation: intent.merge(reason: "Different intent") }, headers: csrf_headers, as: :json
      assert_response :conflict
      post endpoint, params: { preparation: intent.merge(request_key: SecureRandom.uuid) }, headers: csrf_headers, as: :json
      assert_response :unprocessable_entity
    end
  end

  test "revoked permissions deny both replay and fresh preparation while authorized history remains readable" do
    get endpoint
    intent = intent_for(response.parsed_body.fetch("data"))
    post endpoint, params: { preparation: intent }, headers: csrf_headers, as: :json
    assert_response :created
    set_permission!(@membership, "procurement.submit", false)
    post endpoint, params: { preparation: intent }, headers: csrf_headers, as: :json
    assert_response :forbidden
    get endpoint
    assert_response :success
    assert_equal 1, response.parsed_body.dig("data", "attempts").size
    set_permission!(@membership, "procurement.read", false)
    get endpoint
    assert_response :forbidden
  end

  test "attempt snapshot and identity reject model and SQL mutation or deletion" do
    get endpoint
    post endpoint, params: { preparation: intent_for(response.parsed_body.fetch("data")) }, headers: csrf_headers, as: :json
    assert_response :created
    record = Clinic::Inventory::DeliveryPreparation.where(practice: @practice).sole
    assert_raises(ActiveRecord::ReadOnlyRecord) { record.update!(reason: "Changed") }
    assert_raises(ActiveRecord::StatementInvalid) do
      record.class.transaction(requires_new: true) { record.class.where(id: record.id).update_all(delivery_outcome: "acknowledged") }
    end
    assert_raises(ActiveRecord::StatementInvalid) do
      record.class.transaction(requires_new: true) { record.class.where(id: record.id).delete_all }
    end
    assert_equal "unknown", record.reload.delivery_outcome
    assert_equal "1.230001", record.snapshot.dig("lines", 0, "quoted_fee_amount")
  end

  test "unapproved order cannot prepare delivery and non-version source changes are fenced" do
    get endpoint
    intent = intent_for(response.parsed_body.fetch("data"))
    @order.update!(destination_address: "Changed synthetic address")
    post endpoint, params: { preparation: intent }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_empty Clinic::Inventory::DeliveryPreparation.where(practice: @practice)
    @order.update!(status: "draft")
    get endpoint
    assert_equal false, response.parsed_body.dig("data", "can_prepare")
    post endpoint, params: { preparation: intent_for(response.parsed_body.fetch("data")) }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_empty Clinic::Inventory::DeliveryPreparation.where(practice: @practice)
  end

  test "foreign clinic order cannot be read or prepared and malformed intent has no effect" do
    other = Clinic::Practice.create!(name: "Other synthetic preparation clinic")
    foreign_actor = User.create!(email_address: "foreign-preparation@example.invalid", password: SecureRandom.hex(18))
    Clinic::Membership.create!(practice: other, user: foreign_actor)
    foreign = other.inventory_purchase_orders.create!(actor: foreign_actor,
      number: "FOREIGN", status: "draft", version: 1, destination: "Other", reason: "Synthetic",
      request_key: SecureRandom.uuid, payload_digest: "c" * 64)
    get "/api/clinic/inventory/purchase-orders/#{foreign.id}/delivery-preparations"
    assert_response :not_found
    get endpoint
    intent = intent_for(response.parsed_body.fetch("data"))
    post "/api/clinic/inventory/purchase-orders/#{foreign.id}/delivery-preparations", params: { preparation: intent }, headers: csrf_headers, as: :json
    assert_response :not_found
    post endpoint, params: { preparation: intent.merge(request_key: "invalid") }, headers: csrf_headers, as: :json
    assert_response :unprocessable_entity
    assert_empty Clinic::Inventory::DeliveryPreparation.where(practice: @practice)
  end

  private

  def endpoint = "/api/clinic/inventory/purchase-orders/#{@order.id}/delivery-preparations"

  def intent_for(source)
    { request_key: SecureRandom.uuid, order_version: source.fetch("order_version"),
      source_digest: source.fetch("source_digest"), reason: "Synthetic preparation review" }
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end
end
