require "test_helper"
require_relative "../support/pharmacy_method_override"

class PharmacyWorkspaceTest < ActionDispatch::IntegrationTest
  include PharmacyMethodOverride
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "pharmacy@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @other_user = User.create!(email_address: "other-pharmacy@example.invalid", password: @password)
    @other = Development::TestClinic.create!(@other_user).practice
    @product = Clinic::Inventory::PharmacyProduct.create!(practice: @practice, name: "Example tablets", sku: "EXAMPLE-1", reorder_point: 5)
    @practice.inventory_locations.create!(name: "Test shelf", kind: "storage")
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(path, params = {}, method: :post)
    public_send(method, path, params: params, headers: csrf_headers, as: :json)
  end

  def receipt
    { batch: { lot_number: "TEST-LOT", location: "Test shelf", expires_on: (Date.current + 90).to_s, supplier: "Fictional supplier" }, amount: "10", input_unit: "package", reason: "Synthetic receipt", request_key: SecureRandom.uuid }
  end

  def receive(payload = receipt)
    submit "/api/clinic/pharmacy/#{@product.id}/receive", payload
    @product.batches.order(:id).last
  end

  test "catalog response has bounded products and exact stock strings" do
    get "/api/clinic/pharmacy", headers: @headers
    assert_response :success
    assert_equal "application/json", response.media_type
    product = response.parsed_body.fetch("products").sole
    assert_equal "0.0", product.fetch("available_quantity")
    assert_not product.key?("practice_id")
    get "/api/clinic/pharmacy", params: { q: "no such product" }, headers: @headers
    assert_empty response.parsed_body.fetch("products")
  end

  test "JSON product and receipt writes require matching origin and CSRF" do
    attributes = { name: "Fictional API product", sku: "FORM-1", reorder_point: "5" }
    assert_difference "Clinic::Inventory::PharmacyProduct.count", 1 do
      submit "/api/clinic/pharmacy", { clinic_pharmacy_product: attributes }
      assert_response :created
    end
    product = Clinic::Inventory::PharmacyProduct.find_by!(sku: "FORM-1")
    assert_difference "Clinic::Inventory::PharmacyMovement.count", 1 do
      submit "/api/clinic/pharmacy/#{product.id}/receive", receipt
      assert_response :no_content
    end
    assert_equal 10, product.reload.on_hand_quantity
    [ "null", "http://outside.example.invalid" ].each do |origin|
      headers = csrf_headers.merge("Origin" => origin)
      assert_no_difference "Clinic::Inventory::PharmacyProduct.count" do
        post "/api/clinic/pharmacy", params: { clinic_pharmacy_product: attributes.merge(sku: "REJECTED") }, headers: headers, as: :json
      end
      assert_response :unprocessable_entity
    end
    assert_no_difference "Clinic::Inventory::PharmacyProduct.count" do
      post "/api/clinic/pharmacy", params: { clinic_pharmacy_product: attributes.merge(sku: "NO-TOKEN") }, headers: @headers, as: :json
    end
    assert_response :unprocessable_entity
  end

  test "expired sessions reject stale writes and do not create accounts on login" do
    headers = csrf_headers
    @user.member_sessions.update_all(expires_at: 1.minute.ago)
    assert_no_difference "Clinic::Inventory::PharmacyProduct.count" do
      post "/api/clinic/pharmacy", params: { clinic_pharmacy_product: { name: "Unsubmitted fictional product", sku: "STALE" } }, headers: headers, as: :json
    end
    assert_response :unauthorized
    assert_no_difference [ "User.count", "Clinic::Practice.count" ] do
      submit "/api/session", { email_address: @user.email_address, password: @password, return_to: "https://outside.example.invalid" }
    end
    assert_response :success
    get "/api/clinic/pharmacy", headers: @headers
    assert_response :success
  end

  test "manual product cannot forge clinic ownership or FDA provenance" do
    submit "/api/clinic/pharmacy", { clinic_pharmacy_product: { name: "<script>Fictional</script>", sku: "EXAMPLE-2", reorder_point: "3", practice_id: @other.id, source: "openfda", ndc: "9999-9999-99" } }
    assert_response :success
    product = Clinic::Inventory::PharmacyProduct.order(:id).last
    assert_equal @practice.id, product.practice_id
    assert_equal "manual", product.source
    assert_nil product.ndc
    get "/api/clinic/pharmacy/#{product.id}", headers: @headers
    assert_response :success
    assert_equal "<script>Fictional</script>", response.parsed_body.dig("product", "name")
    assert_equal 0, product.on_hand_quantity
  end

  test "receiving is atomic and idempotent and rejects changed retry payloads" do
    payload = receipt
    assert_difference [ "Clinic::Inventory::PharmacyBatch.count", "Clinic::Inventory::PharmacyMovement.count" ], 1 do
      receive(payload)
      assert_response :success
      receive(payload)
    end
    assert_equal 10, @product.reload.on_hand_quantity
    receive(payload.merge(amount: "15"))
    assert_includes response.body, "already used"
    assert_equal 10, @product.reload.on_hand_quantity
    [ "-1", "1.5", "0", "1000001" ].each do |amount|
      assert_no_difference [ "Clinic::Inventory::PharmacyBatch.count", "Clinic::Inventory::PharmacyMovement.count" ] do
        receive(receipt.merge(amount: amount, batch: receipt[:batch].merge(lot_number: "INVALID-#{amount}")))
      end
    end
    assert_no_difference [ "Clinic::Inventory::PharmacyBatch.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      receive(receipt.merge(reason: "", batch: receipt[:batch].merge(lot_number: "MISSING-REASON")))
      receive(receipt.merge(batch: receipt[:batch].merge(lot_number: "NO-DATE", expires_on: "")))
    end
  end

  test "movement totals cannot underflow and retries do not double subtract" do
    batch = receive
    movement = { kind: "adjustment_out", amount: "3", reason: "Fictional cycle count", request_key: SecureRandom.uuid, actor_id: @other_user.id, practice_id: @other.id }
    assert_difference "Clinic::Inventory::PharmacyMovement.count", 1 do
      2.times { submit "/api/clinic/pharmacy_batches/#{batch.id}/movement", movement }
    end
    assert_equal 7, batch.reload.quantity
    assert_equal @user.id, batch.movements.last.actor_id
    assert_no_difference "Clinic::Inventory::PharmacyMovement.count" do
      submit "/api/clinic/pharmacy_batches/#{batch.id}/movement", movement.merge(amount: "8", request_key: SecureRandom.uuid)
      assert_includes response.body, "negative"
    end
    get "/api/clinic/pharmacy/#{@product.id}", headers: @headers
    assert_response :success
    assert_includes response.body, "Fictional cycle count"
  end

  test "held expired and inactive stock is excluded while history and on hand remain" do
    batch = receive
    review = { status: "quarantined", reason: "Fictional packaging review", request_key: SecureRandom.uuid }
    assert_difference "Clinic::Inventory::PharmacyBatchEvent.count", 1 do
      2.times { submit "/api/clinic/pharmacy_batches/#{batch.id}/status", review }
    end
    assert_equal 0, @product.reload.available_quantity
    assert_equal 10, @product.on_hand_quantity
    assert @product.low_stock?
    get "/api/clinic/pharmacy", params: { filter: "held" }, headers: @headers
    assert_equal @product.name, response.parsed_body.fetch("products").sole.fetch("name")
    assert_includes response.body, "quarantined"
    submit "/api/clinic/pharmacy_batches/#{batch.id}/status", review.merge(status: "active", request_key: SecureRandom.uuid)
    assert_equal 10, @product.reload.available_quantity
    receive(receipt.merge(batch: receipt[:batch].merge(lot_number: "OLD-LOT", expires_on: (Date.current - 1).to_s)))
    assert_equal 20, @product.reload.on_hand_quantity
    assert_equal 10, @product.available_quantity
    submit "/api/clinic/pharmacy/#{@product.id}", { clinic_pharmacy_product: { active: "false", reorder_point: "2" } }, method: :patch
    assert_equal 0, @product.reload.available_quantity
    assert_equal 20, @product.on_hand_quantity
    assert_no_difference "Clinic::Inventory::PharmacyMovement.count" do
      receive(receipt.merge(batch: receipt[:batch].merge(lot_number: "INACTIVE-RECEIPT")))
    end
  end

  test "FDA package import uses authenticated signed result and is duplicate safe" do
    record = { name: "Public reference example", ndc: "1234-5678-90", product_ndc: "1234-5678", package_description: "Fictional API fixture", generic_name: "example" }
    with_method(Integrations::Fda::NdcDirectory, :search, [ record ]) do
      submit "/api/clinic/pharmacy/lookup", { ndc_query: "example" }
    end
    assert_response :success
    token = response.parsed_body.fetch("results").sole.fetch("reference_token")
    assert_difference "Clinic::Inventory::PharmacyProduct.count", 1 do
      2.times { submit "/api/clinic/pharmacy/import", { reference_token: token, name: "tampered", practice_id: @other.id } }
    end
    product = Clinic::Inventory::PharmacyProduct.find_by!(ndc: record[:ndc])
    assert_equal record[:name], product.name
    assert_equal @practice.id, product.practice_id
    assert_equal "openfda", product.source
    assert product.imported_at
    assert_equal 0, product.on_hand_quantity
    assert_no_difference "Clinic::Inventory::PharmacyProduct.count" do
      submit "/api/clinic/pharmacy/import", { reference_token: token + "tamper" }
      assert_includes response.body, "expired or changed"
      verifier = Rails.application.message_verifier("pharmacy_ndc_reference")
      wrong_clinic = verifier.generate({ "practice_id" => @other.id, "user_id" => @user.id, "attributes" => record.stringify_keys }, expires_in: 20.minutes, purpose: "ndc_import")
      expired = verifier.generate({ "practice_id" => @practice.id, "user_id" => @user.id, "attributes" => record.stringify_keys }, expires_in: -1.second, purpose: "ndc_import")
      [ wrong_clinic, expired ].each do |invalid|
        submit "/api/clinic/pharmacy/import", { reference_token: invalid }
        assert_includes response.body, "expired or changed"
      end
    end
  end

  test "FDA unavailability and no matches are clear and leave manual entry available" do
    with_method(Integrations::Fda::NdcDirectory, :search, []) { submit "/api/clinic/pharmacy/lookup", { ndc_query: "example" } }
    assert_response :success
    assert_empty response.parsed_body.fetch("results")
    with_method(Integrations::Fda::NdcDirectory, :search, ->(*) { raise Integrations::Fda::NdcDirectory::Unavailable, "The FDA directory could not be reached." }) do
      submit "/api/clinic/pharmacy/lookup", { ndc_query: "example" }
    end
    assert_response :unprocessable_entity
    assert_includes response.body, "could not be reached"
  end

  test "cross clinic role revoked signed out and production requests are denied" do
    foreign = Clinic::Inventory::PharmacyProduct.create!(practice: @other, name: "Other fictional product", sku: "OTHER")
    foreign_batch = foreign.batches.create!(practice_id: @other.id, lot_number: "OTHER", location: "Other shelf", expires_on: Date.current + 30)
    get "/api/clinic/pharmacy/#{foreign.id}", headers: @headers
    assert_response :not_found
    assert_no_difference [ "Clinic::Inventory::PharmacyBatch.count", "Clinic::Inventory::PharmacyMovement.count" ] do
      submit "/api/clinic/pharmacy/#{foreign.id}/receive", receipt
      assert_response :not_found
      submit "/api/clinic/pharmacy_batches/#{foreign_batch.id}/movement", { amount: "1", kind: "receipt", reason: "Not permitted", request_key: SecureRandom.uuid }
      assert_response :not_found
    end
    set_permission!(@membership, "inventory.read", false)
    with_method(Integrations::Fda::NdcDirectory, :search, ->(*) { flunk "Unauthorized request reached FDA" }) do
      get "/api/clinic/pharmacy", headers: @headers
      assert_response :forbidden
      submit "/api/clinic/pharmacy/lookup", { ndc_query: "example" }
      assert_response :forbidden
    end
    set_permission!(@membership, "inventory.read", true)
    with_method(Rails.env, :production?, true) do
      get "/api/clinic/pharmacy", headers: @headers
      assert_response :not_found
    end
    @membership.update!(active: false)
    get "/api/clinic/pharmacy", headers: @headers
    assert_response :forbidden
    submit "/api/session", {}, method: :delete
    get "/api/clinic/pharmacy", headers: @headers
    assert_response :unauthorized
  end
end
