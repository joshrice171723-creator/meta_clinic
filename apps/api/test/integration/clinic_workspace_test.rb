require "test_helper"

class ClinicWorkspaceTest < ActionDispatch::IntegrationTest
  setup do
    Rails.cache.clear
    host! "localhost:3000"
    @headers = { "Origin" => "http://localhost:3000", "REMOTE_ADDR" => "127.0.0.1" }
    @password = SecureRandom.hex(18)
    @user = User.create!(email_address: "clinic-test@example.invalid", password: @password)
    @membership = Development::TestClinic.create!(@user)
    @practice = @membership.practice
    @other_user = User.create!(email_address: "clinic-other@example.invalid", password: @password)
    @other = Development::TestClinic.create!(@other_user).practice
    post "/api/session", params: { email_address: @user.email_address, password: @password }, headers: csrf_headers, as: :json
    assert_response :success
  end

  def csrf_headers
    get "/api/csrf", headers: @headers
    @headers.merge("X-CSRF-Token" => response.parsed_body.fetch("csrf_token"))
  end

  def submit(path, params = {}, method: :post)
    public_send(method, path, params: params, headers: csrf_headers, as: :json)
  end

  test "clinic API exposes only permission scoped data and no page markup" do
    %w[/api/clinic /api/clinic/patients /api/clinic/inventory /api/clinic/staff].each do |path|
      get path, headers: @headers
      assert_response :success
      assert_equal "application/json", response.media_type
      assert_equal "no-store", response.headers["Cache-Control"]
      assert_not_includes response.body, "<html"
    end
    get "/api/clinic", headers: @headers
    assert_equal @practice.id, response.parsed_body.dig("practice", "id")
    assert_equal true, response.parsed_body.dig("capabilities", "patients_access")
  end

  test "clinic context identifies only the current membership credentials" do
    profile = @practice.clinician_profiles.create!(membership: @membership)
    profile.credentials.create!(practice: @practice, credential_type: "SYNTHETIC-NP", jurisdiction: "Synthetic",
      issuer_reference: "CURRENT", review_status: "unverified")
    foreign_profile = @other.clinician_profiles.create!(membership: @other_user.clinic_membership)
    foreign_profile.credentials.create!(practice: @other, credential_type: "FOREIGN", jurisdiction: "Synthetic",
      issuer_reference: "FOREIGN", review_status: "unverified")

    get "/api/clinic/context", headers: @headers

    assert_response :success
    assert_equal [ "SYNTHETIC-NP" ], response.parsed_body.fetch("credentials")
    assert_not_includes response.body, "FOREIGN"
  end

  test "billing dashboard is practice scoped and does not expose patient names" do
    patient = @practice.patients.first
    patient_name = patient.display_name
    invoice = Clinic::Billing::DraftInvoice.call(
      practice: @practice,
      actor: @user,
      patient: patient,
      currency: "USD",
      lines: [ { quantity: "2", unit_amount: "12.50", description_snapshot: "Synthetic billing dashboard line" } ]
    )
    Clinic::Billing::PostInvoice.call(invoice: invoice, actor: @user)
    Clinic::Billing::AllocatePayment.call(
      practice: @practice,
      actor: @user,
      patient: patient,
      invoice: invoice,
      external_event_reference: "synthetic-dashboard-payment",
      currency: "USD",
      amount: "10.00"
    )
    get "/api/clinic/billing", headers: @headers

    assert_response :success
    assert_equal "clinic-billing-v1", response.parsed_body.fetch("schema_version")
    assert_equal @practice.id, response.parsed_body.dig("practice", "id")
    assert response.parsed_body.dig("metrics", "invoice_count") >= 1
    assert_not_includes response.body, patient_name
    assert response.parsed_body.fetch("recent_invoices").all? { |invoice| invoice["total"].is_a?(String) }
    assert response.parsed_body.fetch("recent_payments").all? { |payment| payment["amount"].is_a?(String) }
    assert_equal 1, response.parsed_body.dig("metrics", "currencies", 0, "open_invoice_count")

    revoke_all_permissions!(@membership)
    grant_permissions!(@membership, "billing.read")
    get "/api/clinic/billing", headers: @headers
    assert_response :success
    post "/api/clinic/invoices/#{invoice.id}/post", headers: csrf_headers, as: :json
    assert_response :forbidden

    revoke_all_permissions!(@membership)
    get "/api/clinic/billing", headers: @headers
    assert_response :forbidden
  end

  test "billing dashboard paginates invoice activity without changing aggregate metrics" do
    patient = @practice.patients.first
    2.times do |index|
      Clinic::Billing::DraftInvoice.call(
        practice: @practice,
        actor: @user,
        patient: patient,
        currency: "USD",
        lines: [ { quantity: "1", unit_amount: (index + 1).to_s, description_snapshot: "Synthetic paginated invoice #{index}" } ]
      )
    end

    get "/api/clinic/billing?page=2&per_page=1", headers: @headers

    assert_response :success
    body = response.parsed_body
    assert_equal 2, body.dig("invoice_pagination", "page")
    assert_equal 1, body.dig("invoice_pagination", "per_page")
    assert_equal body.dig("metrics", "invoice_count"), body.dig("invoice_pagination", "total")
    assert_equal 1, body.fetch("recent_invoices").size
    assert body.fetch("recent_invoices").first.fetch("age_days").is_a?(Integer)
    assert_includes [ "0-30 days", "31-60 days", "61-90 days", "91+ days" ], body.fetch("recent_invoices").first.fetch("age_bucket")
  end

  test "billing age filters match the displayed floored age buckets" do
    patient = @practice.patients.first
    now = Time.utc(2026, 9, 3, 12)
    invoices = [
      [ "age_0_30", 30.days + 23.hours ],
      [ "age_31_60", 31.days ],
      [ "age_61_90", 61.days ],
      [ "age_91_plus", 91.days ]
    ].map do |filter, age|
      record = Clinic::Billing::DraftInvoice.call(
        practice: @practice, actor: @user, patient: patient, currency: "USD",
        lines: [ { quantity: "1", unit_amount: "1", description_snapshot: "Synthetic aging boundary #{filter}" } ]
      )
      record.update_columns(created_at: now - age, updated_at: now - age)
      [ filter, record ]
    end

    invoices.each do |filter, expected_invoice|
      result = Clinic::Billing::Dashboard.call(practice: @practice, now: now, filter: filter, per_page: 10)
      row = result.fetch(:recent_invoices).find { |invoice| invoice.fetch(:id) == expected_invoice.id }
      assert row, "expected invoice #{expected_invoice.id} in #{filter}"
      expected_bucket = { "age_0_30" => "0-30", "age_31_60" => "31-60", "age_61_90" => "61-90", "age_91_plus" => "91+" }.fetch(filter)
      assert_equal expected_bucket, row.fetch(:age_bucket).sub(" days", "")
    end
  end

  test "recall creation accepts the first request and replays only the same intent" do
    Development::InventoryScenario.populate!(practice: @practice, actor: @user)
    batch = @practice.pharmacy_products.find_by!(sku: "SYN-ACET-500").batches.find_by!(lot_number: "250701B")
    key = SecureRandom.uuid
    payload = {
      recall: {
        request_key: key,
        batch_id: batch.id,
        reference: "SYN-RECALL-#{SecureRandom.hex(4)}",
        reason: "Synthetic manufacturer notice",
        required_disposition: "return_to_supplier"
      }
    }

    assert_difference "Clinic::Inventory::Recall.count", 1 do
      submit "/api/clinic/inventory/recalls", payload
      assert_response :created
    end
    assert_no_difference "Clinic::Inventory::Recall.count" do
      submit "/api/clinic/inventory/recalls", payload
      assert_response :created
    end
    submit "/api/clinic/inventory/recalls", payload.deep_merge(recall: { reason: "Different intent" })
    assert_response :unprocessable_entity
  end

  test "purchase-order creation serializes same-key requests and rejects changed intent" do
    Development::InventoryScenario.populate!(practice: @practice, actor: @user)
    product = @practice.pharmacy_products.find_by!(sku: "SYN-ACET-500")
    supplier = @practice.inventory_suppliers.find_by!(name: "MedSupply Co.")
    key = SecureRandom.uuid
    payload = {
      purchase_order: {
        request_key: key,
        number: "SYN-PO-#{SecureRandom.hex(4)}",
        supplier_id: supplier.id,
        destination: "Main Pharmacy",
        reason: "Synthetic replenishment",
        tax: "0",
        shipping: "4.25",
        lines: [ {
          product_id: product.id,
          quantity: "2",
          input_unit: "package",
          conversion_factor: product.package_size.to_s,
          unit_price: "12.375",
          currency: "USD"
        } ]
      }
    }

    assert_difference "Clinic::Inventory::PurchaseOrder.count", 1 do
      submit "/api/clinic/inventory/purchase-orders", payload
      assert_response :created
    end
    assert_no_difference "Clinic::Inventory::PurchaseOrder.count" do
      submit "/api/clinic/inventory/purchase-orders", payload
      assert_response :created
    end
    submit "/api/clinic/inventory/purchase-orders", payload.deep_merge(purchase_order: { shipping: "5.00" })
    assert_response :unprocessable_entity
  end

  test "purchase-order generated numbers remain distinct within one second" do
    Development::InventoryScenario.populate!(practice: @practice, actor: @user)
    product = @practice.pharmacy_products.find_by!(sku: "SYN-ACET-500")
    supplier = @practice.inventory_suppliers.find_by!(name: "MedSupply Co.")
    build_payload = lambda do |key|
      { purchase_order: { request_key: key, supplier_id: supplier.id, destination: "Main Pharmacy", reason: "Synthetic replenishment", lines: [ { product_id: product.id, quantity: "1", unit_price: "2.50", currency: "USD" } ] } }
    end
    travel_to Time.current.change(usec: 0) do
      submit "/api/clinic/inventory/purchase-orders", build_payload.call(SecureRandom.uuid)
      assert_response :created
      submit "/api/clinic/inventory/purchase-orders", build_payload.call(SecureRandom.uuid)
      assert_response :created
    end
    numbers = @practice.inventory_purchase_orders.order(id: :desc).limit(2).pluck(:number)
    assert_equal 2, numbers.uniq.size
  end

  test "purchase-order creation rejects forged package metadata and mixed currencies atomically" do
    Development::InventoryScenario.populate!(practice: @practice, actor: @user)
    product = @practice.pharmacy_products.find_by!(sku: "SYN-ACET-500")
    base = { supplier_id: @practice.inventory_suppliers.first.id, destination: "Main Pharmacy", reason: "Synthetic validation", lines: [ { product_id: product.id, quantity: "1", unit_price: "2.50", currency: "USD" } ] }
    initial_count = Clinic::Inventory::PurchaseOrder.where(practice_id: @practice.id).count
    [ { input_unit: "tablet" }, { conversion_factor: (product.package_size.to_d + 1).to_s } ].each do |forged|
      submit "/api/clinic/inventory/purchase-orders", { purchase_order: base.deep_merge(request_key: SecureRandom.uuid, lines: [ base[:lines].first.merge(forged) ]) }
      assert_response :unprocessable_entity
      assert_equal initial_count, Clinic::Inventory::PurchaseOrder.where(practice_id: @practice.id).count
    end
    mixed = base.merge(request_key: SecureRandom.uuid, lines: [ base[:lines].first, base[:lines].first.merge(currency: "CAD") ])
    submit "/api/clinic/inventory/purchase-orders", { purchase_order: mixed }
    assert_response :unprocessable_entity
    assert_equal initial_count, Clinic::Inventory::PurchaseOrder.where(practice_id: @practice.id).count
  end

  test "recall evidence stays linked when recalls share a lot" do
    Development::InventoryScenario.populate!(practice: @practice, actor: @user)
    batch = @practice.pharmacy_products.find_by!(sku: "SYN-ACET-500").batches.find_by!(lot_number: "250701B")
    build_recall = lambda do |reference|
      recall = @practice.inventory_recalls.create!(product: batch.product, actor: @user, reference: reference, status: "disposition_pending", reason: "Synthetic notice", required_disposition: "return_to_supplier", effective_on: Date.current, affected_units: batch.quantity, request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16))
      recall.recall_lots.create!(practice: @practice, lot: batch.lot)
      recall
    end
    recall_a = build_recall.call("SYN-RECALL-A")
    recall_b = build_recall.call("SYN-RECALL-B")
    ApplicationRecord.connection.execute("SELECT set_config('apply.inventory_action', 'inventory.hold', true)")
    batch.holds.create!(practice: @practice, actor: @user, recall: recall_a, kind: "recalled", reason: "Synthetic A hold", request_key: SecureRandom.uuid)

    wire = Clinic::Inventory::InventoryWire.call(practice: @practice, actor: @user)
    balance = wire.fetch(:balances).find { |row| row[:id] == "bal_#{batch.id}" }
    assert_equal [ recall_a.id.to_s ], balance.fetch(:recall_ids)
    assert_equal batch.quantity.to_d.to_s("F"), wire.fetch(:recalls).find { |row| row[:id] == recall_a.id.to_s }.fetch(:held_units)
    assert_equal "0.0", wire.fetch(:recalls).find { |row| row[:id] == recall_b.id.to_s }.fetch(:held_units)
    before = [ batch.reload.quantity, Clinic::Inventory::PharmacyMovement.where(batch_id: batch.id).count ]
    assert_raises(ArgumentError) do
      Clinic::Inventory::RecallDisposition.execute!(recall: recall_b, actor: @user, batch_id: batch.id, quantity: "1", method: "return_to_supplier", evidence_reference: "SYN-B", reason: "Synthetic B", request_key: SecureRandom.uuid)
    end
    assert_equal before, [ batch.reload.quantity, Clinic::Inventory::PharmacyMovement.where(batch_id: batch.id).count ]
  end

  test "a separately authorized receiver quarantines a first incoming recalled lot" do
    product = @practice.pharmacy_products.create!(
      name: "Synthetic recalled tablet", sku: "SYN-FIRST-RECALL", stock_unit: "tablet",
      quantity_scale: 0, package_size: 100, unit_reference: "Synthetic package specification v1"
    )
    quarantine = @practice.inventory_locations.create!(name: "Quarantine", kind: "quarantine")
    lot = Clinic::Inventory::Lot.create!(
      practice: @practice, product: product, number: "SYN-FIRST-LOT",
      expires_on: Date.current + 1.year
    )
    recall = @practice.inventory_recalls.create!(
      product: product, actor: @user, reference: "SYN-FIRST-RECALL-NOTICE",
      status: "disposition_pending", reason: "Synthetic manufacturer notice",
      required_disposition: "return_to_supplier", effective_on: Date.current,
      affected_units: 200, request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16)
    )
    recall.recall_lots.create!(practice: @practice, lot: lot)
    order = @practice.inventory_purchase_orders.create!(
      actor: @user, number: "SYN-PO-FIRST-RECALL", status: "sent",
      destination: quarantine.name, reason: "Synthetic recalled shipment",
      request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16),
      version: 1, subtotal: 2, tax: 0, shipping: 0, total: 2
    )
    line = order.lines.create!(
      practice: @practice, product: product, product_name: product.name,
      stock_unit: product.stock_unit, input_unit: "package", ordered_quantity: 2,
      received_quantity: 0, conversion_factor: product.package_size,
      unit_price: 1, currency: "USD"
    )
    shipment = order.shipments.create!(
      practice: @practice, actor: @user, reference: "SYN-SHIP-FIRST-RECALL",
      supplier_reference: "SYN-SUPPLIER-FIRST-RECALL", status: "delivered",
      package_count: 2, expected_units: 200, delivered_at: Time.current,
      request_key: SecureRandom.uuid, payload_digest: SecureRandom.hex(16)
    )
    shipment.shipment_lines.create!(
      practice: @practice, purchase_order_line: line, expected_packages: 2
    )
    assert_empty product.batches

    receiver = User.create!(email_address: "separate-receiver@example.invalid", password: @password)
    receiver_membership = @practice.memberships.create!(user: receiver)
    grant_permissions!(receiver_membership, "inventory.read", "inventory.receive", "recall.lock")
    submit "/api/session", {}, method: :delete
    submit "/api/session", { email_address: receiver.email_address, password: @password }
    assert_response :success

    assert_difference [ "Clinic::Inventory::Receipt.count", "Clinic::Inventory::Hold.count" ], 1 do
      submit "/api/clinic/inventory/receipts", {
        receipt: {
          request_key: SecureRandom.uuid,
          purchase_order_id: order.id,
          shipment_id: shipment.id,
          purchase_order_line_id: line.id,
          lot_number: lot.number,
          expiration_date: lot.expires_on.iso8601,
          quantity_packages: "2",
          destination_location: quarantine.name,
          recall_id: recall.id,
          status: "quarantined",
          reason: "Synthetic recall quarantine"
        }
      }
      assert_response :success
    end
    receipt = shipment.receipts.sole
    assert_equal receiver.id, receipt.actor_id
    assert_equal recall.id, receipt.lines.sole.batch.active_holds.sole.recall_id
    assert_not receipt.lines.sole.batch.available?
  end

  test "login never selects creates or changes the assigned clinic" do
    submit "/api/session", {}, method: :delete
    get "/api/clinic", headers: @headers
    assert_response :unauthorized
    submit "/api/session", { email_address: @user.email_address, password: "wrong" }
    assert_response :unauthorized
    assert_no_difference [ "User.count", "Clinic::Practice.count", "Clinic::Membership.count" ] do
      submit "/api/session", { email_address: @user.email_address, password: @password, return_to: "https://example.invalid", practice_id: @other.id }
      assert_response :success
    end
    assert_equal @practice.id, @user.reload.clinic_membership.practice_id
  end

  test "a login has one clinic and setup never changes or reactivates its membership" do
    @membership.update!(active: false, patients_access: false)
    assert_no_difference [ "Clinic::Practice.count", "Clinic::Membership.count" ] do
      assert_equal @membership, Development::TestClinic.create!(@user)
    end
    assert_not @membership.reload.active?
    assert_not @membership.patients_access?
    duplicate = Clinic::Membership.new(user: @user, practice: @other)
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:user_id], "has already been taken"
  end

  test "patient creation and append-only draft scoped to clinic regardless of submitted ownership" do
    get "/api/clinic/patients", headers: @headers
    assert_no_difference "Clinic::Care::Patient.count" do
      submit "/api/clinic/patients", { clinic_patient: { display_name: "Example C", reference: "DEMO-003", practice_id: @other.id } }
      assert_response :bad_request
    end
    assert_difference "Clinic::Care::Patient.count" do
      submit "/api/clinic/patients", { clinic_patient: { display_name: "Example C", reference: "DEMO-003" } }
      assert_response :created
    end
    patient = @practice.patients.find_by!(reference: "DEMO-003")
    submit "/api/clinic/patients/#{patient.id}/note", { body: "<script>fictional only</script>", practice_id: @other.id, author_id: @other_user.id }
    assert_response :success
    note = patient.notes.sole
    assert_equal @user.id, note.author_id
    assert_equal @practice.id, note.practice_id
    assert_not_includes note.ciphertext_for(:body), "fictional only"
    assert_not note.update(body: "overwrite")
    get "/api/clinic/patients/#{patient.id}", headers: @headers
    assert_response :success
    assert_equal "<script>fictional only</script>", response.parsed_body.fetch("notes").sole.fetch("body")
    foreign = @other.patients.first
    get "/api/clinic/patients/#{foreign.id}", headers: @headers
    assert_response :not_found
    assert_no_difference "Clinic::Care::Note.count" do
      submit "/api/clinic/patients/#{foreign.id}/note", { body: "Unauthorized synthetic attempt" }
      assert_response :not_found
    end
    assert_raises ActiveRecord::InvalidForeignKey do
      ApplicationRecord.transaction(requires_new: true) do
        Clinic::Care::Note.insert_all!([ { practice_id: @practice.id, patient_id: foreign.id, author_id: @user.id, body: "synthetic invalid link", created_at: Time.current, updated_at: Time.current } ])
      end
    end
  end

  test "inventory adjustment is atomic, idempotent and clinic scoped" do
    item = @practice.items.first
    original = item.quantity
    payload = { delta: "2", reason: "Synthetic receipt", request_key: SecureRandom.uuid }
    assert_difference "Clinic::Inventory::StockMovement.count", 1 do
      submit "/api/clinic/inventory/#{item.id}/adjust", payload
      assert_response :success
      submit "/api/clinic/inventory/#{item.id}/adjust", payload
      assert_response :success
    end
    assert_equal original + 2, item.reload.quantity
    submit "/api/clinic/inventory/#{item.id}/adjust", payload.merge(delta: "-9999", request_key: SecureRandom.uuid)
    assert_response :unprocessable_entity
    assert_equal original + 2, item.reload.quantity
    submit "/api/clinic/inventory/#{item.id}/adjust", payload.merge(reason: "", request_key: SecureRandom.uuid)
    assert_response :bad_request
    assert_equal original + 2, item.reload.quantity
    submit "/api/clinic/inventory/#{@other.items.first.id}/adjust", payload
    assert_response :not_found
    submit "/api/clinic/inventory", { clinic_item: { name: "Desk paper", sku: "DESK", reorder_level: 4, quantity: 100, practice_id: @other.id } }
    assert_response :bad_request
    submit "/api/clinic/inventory", { clinic_item: { name: "Desk paper", sku: "DESK", reorder_level: 4 } }
    assert_response :created
    assert_equal 0, @practice.items.find_by!(sku: "DESK").quantity
  end

  test "staff directory cannot grant access and status changes stay in clinic" do
    assert_no_difference [ "User.count", "Clinic::Membership.count", "Clinic::RoleGrant.count",
      "Clinic::ClinicianProfile.count", "Clinic::ClinicianCredential.count" ] do
      submit "/api/clinic/staff", { clinic_staff_member: { display_name: "Morgan Example", job_title: "Coordinator", user_id: @other_user.id, admin: true, practice_id: @other.id } }
      assert_response :bad_request
      submit "/api/clinic/staff", { clinic_staff_member: { display_name: "Morgan Example", job_title: "Coordinator" } }
      assert_response :created
    end
    person = @practice.staff_members.order(:id).last
    submit "/api/clinic/staff/#{person.id}", { active: "false" }, method: :patch
    assert_response :success
    assert_not person.reload.active?
    assert @membership.reload.active?
    submit "/api/clinic/staff/#{@other.staff_members.first.id}", { active: "false" }, method: :patch
    assert_response :not_found
    assert @other.staff_members.first.active?
  end

  test "per-module capability and membership revocation enforced on every route" do
    @membership.update!(patients_access: false, inventory_access: false, staff_access: false)
    revoke_all_permissions!(@membership)
    %w[/api/clinic/patients /api/clinic/inventory /api/clinic/staff].each do |path|
      get path, headers: @headers
      assert_response :forbidden
    end
    submit "/api/clinic/patients", { clinic_patient: { display_name: "No access", reference: "NO" } }
    assert_response :forbidden
    assert_equal "denied", Clinic::AuditEvent.order(:id).last.outcome
    assert_equal "patients.write", Clinic::AuditEvent.order(:id).last.action_code
    @membership.update!(active: false)
    get "/api/clinic", headers: @headers
    assert_response :forbidden
    get "/api/session", headers: @headers
    assert_response :success
    @user.update!(admin: true)
    get "/api/clinic", headers: @headers
    assert_response :forbidden
  end

  test "sensitive patient reads create released audit events" do
    before = Clinic::AuditEvent.count
    get "/api/clinic/patients", headers: @headers
    assert_response :success

    assert_equal before + 1, Clinic::AuditEvent.count
    event = Clinic::AuditEvent.order(:id).last
    assert_equal "patients.read", event.action_code
    assert_equal "released", event.outcome
    assert_equal "user:#{@user.id}", event.actor_session_reference
  end

  test "clinic is disabled in production even for assigned administrators" do
    old_env = Rails.env
    Rails.env = "production"
    get "/api/clinic", headers: @headers
    assert_response :not_found
    submit "/api/clinic/patients", { clinic_patient: { display_name: "No production", reference: "NO" } }
    assert_response :not_found
  ensure
    Rails.env = old_env
  end
end
