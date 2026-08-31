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
    @membership = Clinic::DemoSetup.create!(@user)
    @practice = @membership.practice
    @other_user = User.create!(email_address: "other-pharmacy@example.invalid", password: @password)
    @other = Clinic::DemoSetup.create!(@other_user).practice
    @product = Clinic::PharmacyProduct.create!(practice: @practice, name: "Example tablets", sku: "EXAMPLE-1", reorder_point: 5)
    get "/login", headers: @headers
    post "/login", params: { email_address: @user.email_address, password: @password, authenticity_token: csrf }, headers: @headers
  end

  def csrf
    Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
  end

  def submit(path, params = {}, method: :post)
    get "/clinic", headers: @headers
    public_send(method, path, params: params.merge(authenticity_token: csrf), headers: @headers)
  end

  def receipt
    { batch: { lot_number: "TEST-LOT", location: "Test shelf", expires_on: (Date.current + 90).to_s, supplier: "Fictional supplier" }, amount: "10", reason: "Synthetic receipt", request_key: SecureRandom.uuid }
  end

  def receive(payload = receipt)
    submit "/clinic/pharmacy/#{@product.id}/receive", payload
    @product.batches.order(:id).last
  end

  test "EHR navigation and empty searchable catalog render without JavaScript" do
    get "/clinic/patients", headers: @headers
    assert_select "nav[aria-label='EHR sections'] a[href='/clinic/pharmacy']"
    get "/clinic/pharmacy", headers: @headers
    assert_response :success
    assert_select "script", count: 0
    assert_select "h1", text: "Pharmacy inventory."
    assert_select ".clinic-stat strong", text: "0"
    get "/clinic/pharmacy", params: { q: "no such product" }, headers: @headers
    assert_includes response.body, "No products match"
    get "/clinic/pharmacy/new", headers: @headers
    assert_response :success
    assert_select "form[action='/clinic/pharmacy/lookup']"
    assert_select "form[action='/clinic/pharmacy']"
    assert_includes response.body, "Search sends only"
  end

  test "manual product cannot forge clinic ownership or FDA provenance" do
    submit "/clinic/pharmacy", { clinic_pharmacy_product: { name: "<script>Fictional</script>", sku: "EXAMPLE-2", reorder_point: "3", practice_id: @other.id, source: "openfda", ndc: "9999-9999-99" } }
    assert_response :see_other
    product = Clinic::PharmacyProduct.order(:id).last
    assert_equal @practice.id, product.practice_id
    assert_equal "manual", product.source
    assert_nil product.ndc
    follow_redirect!
    assert_response :success
    assert_select "script", count: 0
    assert_includes response.body, "&lt;script&gt;Fictional&lt;/script&gt;"
    assert_equal 0, product.on_hand_quantity
  end

  test "receiving is atomic and idempotent and rejects changed retry payloads" do
    payload = receipt
    assert_difference [ "Clinic::PharmacyBatch.count", "Clinic::PharmacyMovement.count" ], 1 do
      receive(payload)
      assert_response :see_other
      receive(payload)
    end
    assert_equal 10, @product.reload.on_hand_quantity
    receive(payload.merge(amount: "15"))
    follow_redirect!
    assert_includes response.body, "already used"
    assert_equal 10, @product.reload.on_hand_quantity
    [ "-1", "1.5", "0", "1000001" ].each do |amount|
      assert_no_difference [ "Clinic::PharmacyBatch.count", "Clinic::PharmacyMovement.count" ] do
        receive(receipt.merge(amount: amount, batch: receipt[:batch].merge(lot_number: "INVALID-#{amount}")))
      end
    end
    assert_no_difference [ "Clinic::PharmacyBatch.count", "Clinic::PharmacyMovement.count" ] do
      receive(receipt.merge(reason: "", batch: receipt[:batch].merge(lot_number: "MISSING-REASON")))
      receive(receipt.merge(batch: receipt[:batch].merge(lot_number: "NO-DATE", expires_on: "")))
    end
  end

  test "movement totals cannot underflow and retries do not double subtract" do
    batch = receive
    movement = { kind: "adjustment_out", amount: "3", reason: "Fictional cycle count", request_key: SecureRandom.uuid, actor_id: @other_user.id, practice_id: @other.id }
    assert_difference "Clinic::PharmacyMovement.count", 1 do
      2.times { submit "/clinic/pharmacy_batches/#{batch.id}/movement", movement }
    end
    assert_equal 7, batch.reload.quantity
    assert_equal @user.id, batch.movements.last.actor_id
    assert_no_difference "Clinic::PharmacyMovement.count" do
      submit "/clinic/pharmacy_batches/#{batch.id}/movement", movement.merge(amount: "8", request_key: SecureRandom.uuid)
      follow_redirect!
      assert_includes response.body, "negative"
    end
    get "/clinic/pharmacy/#{@product.id}", headers: @headers
    assert_response :success
    assert_includes response.body, "Fictional cycle count"
  end

  test "held expired and inactive stock is excluded while history and on hand remain" do
    batch = receive
    review = { status: "quarantined", reason: "Fictional packaging review", request_key: SecureRandom.uuid }
    assert_difference "Clinic::PharmacyBatchEvent.count", 1 do
      2.times { submit "/clinic/pharmacy_batches/#{batch.id}/status", review }
    end
    assert_equal 0, @product.reload.available_quantity
    assert_equal 10, @product.on_hand_quantity
    assert @product.low_stock?
    get "/clinic/pharmacy", params: { filter: "held" }, headers: @headers
    assert_includes response.body, "Quarantined"
    submit "/clinic/pharmacy_batches/#{batch.id}/status", review.merge(status: "active", request_key: SecureRandom.uuid)
    assert_equal 10, @product.reload.available_quantity
    receive(receipt.merge(batch: receipt[:batch].merge(lot_number: "OLD-LOT", expires_on: (Date.current - 1).to_s)))
    assert_equal 20, @product.reload.on_hand_quantity
    assert_equal 10, @product.available_quantity
    submit "/clinic/pharmacy/#{@product.id}", { clinic_pharmacy_product: { active: "false", reorder_point: "2" } }, method: :patch
    assert_equal 0, @product.reload.available_quantity
    assert_equal 20, @product.on_hand_quantity
    assert_no_difference "Clinic::PharmacyMovement.count" do
      receive(receipt.merge(batch: receipt[:batch].merge(lot_number: "INACTIVE-RECEIPT")))
    end
  end

  test "FDA package import uses authenticated signed result and is duplicate safe" do
    record = { name: "Public reference example", ndc: "1234-5678-90", product_ndc: "1234-5678", package_description: "Fictional API fixture", generic_name: "example" }
    with_method(Pharmacy::NdcDirectory, :search, [ record ]) do
      submit "/clinic/pharmacy/lookup", { ndc_query: "example" }
    end
    assert_response :success
    token = Nokogiri::HTML(response.body).at_css('input[name="reference_token"]')["value"]
    assert_difference "Clinic::PharmacyProduct.count", 1 do
      2.times { submit "/clinic/pharmacy/import", { reference_token: token, name: "tampered", practice_id: @other.id } }
    end
    product = Clinic::PharmacyProduct.find_by!(ndc: record[:ndc])
    assert_equal record[:name], product.name
    assert_equal @practice.id, product.practice_id
    assert_equal "openfda", product.source
    assert product.imported_at
    assert_equal 0, product.on_hand_quantity
    assert_no_difference "Clinic::PharmacyProduct.count" do
      submit "/clinic/pharmacy/import", { reference_token: token + "tamper" }
      follow_redirect!
      assert_includes response.body, "expired or changed"
      verifier = Rails.application.message_verifier("pharmacy_ndc_reference")
      wrong_clinic = verifier.generate({ "practice_id" => @other.id, "user_id" => @user.id, "attributes" => record.stringify_keys }, expires_in: 20.minutes, purpose: "ndc_import")
      expired = verifier.generate({ "practice_id" => @practice.id, "user_id" => @user.id, "attributes" => record.stringify_keys }, expires_in: -1.second, purpose: "ndc_import")
      [ wrong_clinic, expired ].each do |invalid|
        submit "/clinic/pharmacy/import", { reference_token: invalid }
        follow_redirect!
        assert_includes response.body, "expired or changed"
      end
    end
  end

  test "FDA unavailability and no matches are clear and leave manual entry available" do
    with_method(Pharmacy::NdcDirectory, :search, []) { submit "/clinic/pharmacy/lookup", { ndc_query: "example" } }
    assert_response :success
    assert_includes response.body, "No matching packages"
    with_method(Pharmacy::NdcDirectory, :search, ->(*) { raise Pharmacy::NdcDirectory::Unavailable, "The FDA directory could not be reached." }) do
      submit "/clinic/pharmacy/lookup", { ndc_query: "example" }
    end
    assert_response :unprocessable_entity
    assert_includes response.body, "could not be reached"
    assert_select "form[action='/clinic/pharmacy']"
  end

  test "cross clinic role revoked signed out and production requests are denied" do
    foreign = Clinic::PharmacyProduct.create!(practice: @other, name: "Other fictional product", sku: "OTHER")
    foreign_batch = foreign.batches.create!(practice_id: @other.id, lot_number: "OTHER", location: "Other shelf", expires_on: Date.current + 30)
    get "/clinic/pharmacy/#{foreign.id}", headers: @headers
    assert_response :not_found
    assert_no_difference [ "Clinic::PharmacyBatch.count", "Clinic::PharmacyMovement.count" ] do
      submit "/clinic/pharmacy/#{foreign.id}/receive", receipt
      assert_response :not_found
      submit "/clinic/pharmacy_batches/#{foreign_batch.id}/movement", { amount: "1", kind: "receipt", reason: "Not permitted", request_key: SecureRandom.uuid }
      assert_response :not_found
    end
    @membership.update!(inventory_access: false)
    with_method(Pharmacy::NdcDirectory, :search, ->(*) { flunk "Unauthorized request reached FDA" }) do
      get "/clinic/pharmacy", headers: @headers
      assert_response :forbidden
      submit "/clinic/pharmacy/lookup", { ndc_query: "example" }
      assert_response :forbidden
    end
    @membership.update!(inventory_access: true)
    with_method(Rails.env, :production?, true) do
      get "/clinic/pharmacy", headers: @headers
      assert_response :not_found
    end
    @membership.update!(active: false)
    get "/clinic/pharmacy", headers: @headers
    assert_response :forbidden
    submit "/logout"
    get "/clinic/pharmacy", headers: @headers
    assert_redirected_to "/login"
  end
end
