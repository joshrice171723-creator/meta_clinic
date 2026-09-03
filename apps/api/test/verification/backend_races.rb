# Invoked only by bin/verify-backend on its own fresh database; not fixture tests.
raise "Test scratch database required" unless Rails.env.test? && ApplicationRecord.connection_db_config.database.start_with?("apply_backend_verify_")

practice = Development::BackendSamples.call.first
actor = practice.memberships.joins(:user).find_by!(users: { email_address: "synthetic-review-a-admin-2@example.invalid" }).user
patient = practice.patients.first

def race
  ready = Queue.new
  start = Queue.new
  workers = 2.times.map do |index|
    Thread.new do
      ApplicationRecord.connection_pool.with_connection do
        ready << true
        start.pop
        yield index
      end
    end
  end
  2.times { ready.pop }
  2.times { start << true }
  workers.map(&:value)
end

3.times do |trial|
  invoice = Clinic::Billing::DraftInvoice.call(practice: practice, actor: actor, patient: patient, currency: "USD",
    lines: [ { quantity: "1", unit_amount: "10", description_snapshot: "Synthetic race" } ])
  Clinic::Billing::PostInvoice.call(invoice: invoice, actor: actor)
  results = race do |index|
    begin
      Clinic::Billing::AllocatePayment.call(practice: practice, actor: actor, patient: patient, invoice: invoice,
        external_event_reference: "race-#{trial}-#{index}", currency: "USD", amount: "10")
      :accepted
    rescue ArgumentError
      :denied
    end
  end
  raise "Concurrent independent payments over-allocate invoice" unless results.sort == [ :accepted, :denied ] && invoice.payment_allocations.sum(:amount) == 10
end
puts "PASS: independent connections cannot over-allocate one invoice"

versions = race do |index|
  Clinic::Care::AddPatientAddress.call(practice: practice, actor: actor, patient: patient,
    encrypted_address: "Synthetic concurrent address #{index}", make_primary: true).version
end
raise "Address versions lost or duplicated" unless versions.uniq.size == 2
puts "PASS: simultaneous address versions are serialized"

site = practice.sites.first
room = site.rooms.first
results = race do |_index|
  begin
    Clinic::Scheduling::BookAppointment.call(practice: practice, actor: actor, patient: patient, site: site, room: room,
      starts_at: Time.utc(2031, 1, 1), ends_at: Time.utc(2031, 1, 1, 0, 30))
    :accepted
  rescue ArgumentError
    :denied
  end
end
raise "Overlapping reservations raced" unless results.sort == [ :accepted, :denied ]
puts "PASS: simultaneous active room reservations exclude overlap"

encounter = practice.encounters.first
note = Clinic::Care::CreateEncounterNote.call(practice: practice, actor: actor, encounter: encounter,
  encrypted_body: "Synthetic start", request_key: "backend-race-note-create")
results = race do |index|
  begin
    Clinic::Care::ReviseEncounterNote.call(note: Clinic::EncounterNote.find(note.id), actor: actor,
    encrypted_body: "Synthetic revision #{index}", expected_revision: 1,
    request_key: "backend-race-note-revise-#{index}")
    :accepted
  rescue ActiveRecord::StaleObjectError
    :stale
  end
end
raise "Concurrent note revisions lost history" unless results.sort == [ :accepted, :stale ] && note.revisions.count == 2
puts "PASS: simultaneous revisions reject the stale writer"

Development::InventoryScenario.populate!(practice: practice, actor: actor)
wire = Clinic::Inventory::InventoryWire.call(practice: practice, actor: actor)
raise "Inventory wire omitted canonical products" unless wire.fetch(:products).map { |product| product.fetch(:ndc) }.sort == %w[00063-0876-21 00555-0134-02]
raise "Inventory wire omitted canonical package IDs" unless wire.fetch(:packages).map { |package| package.fetch(:id) }.sort == %w[pkg_acetaminophen_bottle pkg_dextroamphetamine_bottle]
order = practice.inventory_purchase_orders.find_by!(number: "PO-2026-000345")
line = order.lines.sole
raise "Purchase-order arithmetic is not canonical" unless [ line.ordered_quantity.to_i, line.received_quantity.to_i, order.subtotal.to_f, order.shipping.to_f, order.total.to_f ] == [ 45, 40, 108.0, 12.0, 120.0 ]
receipt = order.receipts.includes(:lines).sole
raise "Receipt linkage or quantity is incomplete" unless receipt.shipment_id.present? && receipt.lines.sole.quantity.to_i == 4000
recalled_batch = practice.pharmacy_products.find_by!(sku: "SYN-ACET-500").batches.find_by!(lot_number: "250601A", location: "Quarantine")
raise "Recall did not remove availability" unless !recalled_batch.available? && recalled_batch.quantity.to_i == 4000
returns = practice.inventory_locations.create!(name: "Returns Holding")
active_batch = practice.pharmacy_products.find_by!(sku: "SYN-ACET-500").batches.find_by!(lot_number: "250701B", location: "Main Pharmacy")
transfer_key = SecureRandom.uuid
transfer = Clinic::Inventory::TransferStock.call(practice: practice, actor: actor, source_batch_id: active_batch.id, destination_location_id: returns.id, amount: 25, reason: "Synthetic transfer trace", request_key: transfer_key)
replayed_transfer = Clinic::Inventory::TransferStock.call(practice: practice, actor: actor, source_batch_id: active_batch.id, destination_location_id: returns.id, amount: 25, reason: "Synthetic transfer trace", request_key: transfer_key)
raise "Transfer replay created a duplicate" unless transfer.id == replayed_transfer.id && Clinic::Inventory::Transfer.where(practice_id: practice.id, request_key: transfer_key).count == 1
raise "Recalled stock transfer was not blocked" unless begin
  Clinic::Inventory::TransferStock.call(practice: practice, actor: actor, source_batch_id: recalled_batch.id, destination_location_id: active_batch.location_id, amount: 1, reason: "Unsafe synthetic transfer", request_key: SecureRandom.uuid)
  false
rescue ArgumentError
  true
end
reader = practice.memberships.joins(:user).find_by!(users: { email_address: "synthetic-review-a-reader@example.invalid" }).user
raise "Reader received procurement write authority" if Clinic::Authorization.allowed?(actor: reader, practice: practice, action: "procurement.create")
raise "Reader received controlled certification authority" if Clinic::Authorization.allowed?(actor: reader, practice: practice, action: "controlled.certify")
controlled_count = Clinic::Inventory::Count.where(practice_id: practice.id).order(:id).last
begin
  Clinic::Inventory::ControlReview.record!(count: controlled_count, actor: actor, kind: "certification", reason: "Premature synthetic certification", request_key: SecureRandom.uuid)
  raise "Premature controlled certification was accepted"
rescue ArgumentError
  nil
end
investigation_key = SecureRandom.uuid
controlled_count.approve!(actor: actor, request_key: investigation_key)
Clinic::Inventory::ControlReview.record!(count: controlled_count, actor: actor, kind: "investigation", reason: "Synthetic variance investigated", request_key: SecureRandom.uuid)
reviewer = practice.memberships.joins(:user).find_by!(users: { email_address: "synthetic-review-a-inventory-1@example.invalid" }).user
Clinic::Inventory::ControlReview.record!(count: controlled_count, actor: reviewer, kind: "certification", reason: "Synthetic PIC certification", request_key: SecureRandom.uuid)
raise "Controlled certification did not require a separate reviewer" unless Clinic::Inventory::ControlReview.where(count_id: controlled_count.id, kind: "certification", actor_id: reviewer.id).exists?
recall = practice.inventory_recalls.find_by!(reference: "FDA-ACET-2026-08")
begin
  Clinic::Inventory::RecallDisposition.execute!(recall: recall, actor: actor, batch_id: recalled_batch.id, quantity: 4001, method: "return_to_supplier", evidence_reference: "SYN-RMA-OVER", reason: "Synthetic overage", request_key: SecureRandom.uuid)
  raise "Recall over-disposition was accepted"
rescue ArgumentError
  nil
end
Clinic::Inventory::RecallDisposition.execute!(recall: recall, actor: actor, batch_id: recalled_batch.id, quantity: 4000, method: "return_to_supplier", evidence_reference: "SYN-RMA-4000", reason: "Synthetic supplier return", request_key: SecureRandom.uuid)
raise "Recall disposition did not close the held quantity" unless recall.reload.status == "disposition_complete"
other_practice = Development::BackendSamples.call.last
raise "Foreign practice inventory leaked into the wire" unless Clinic::Inventory::InventoryWire.call(practice: other_practice, actor: other_practice.memberships.joins(:user).find_by!(users: { email_address: "synthetic-review-b-admin@example.invalid" }).user).fetch(:products).empty?
puts "PASS: inventory wire, PO/receipt traceability, recall blocking/disposition, transfer replay, tenant isolation and controlled separation-of-duties"

# Exercise the actual grants file with a unique no-login role on this scratch DB.
connection = ApplicationRecord.connection
role = "apply_verify_role_#{SecureRandom.hex(6)}"
connection.execute("CREATE ROLE #{role} NOLOGIN")
begin
  sql = Rails.root.join("db/runtime_privileges.sql").read.gsub("DATABASE apply", "DATABASE #{ApplicationRecord.connection_db_config.database}").gsub("apply_runtime", role)
  connection.execute(sql)
  connection.execute("SET ROLE #{role}")
  [ "UPDATE clinic_model_versions SET event = 'update'", "DELETE FROM clinic_audit_events", "TRUNCATE clinic_model_versions",
    "INSERT INTO permissions(action_code, created_at, updated_at) VALUES ('forged', NOW(), NOW())" ].each do |statement|
    denied = false
    begin
      connection.transaction(requires_new: true) { connection.execute(statement) }
    rescue ActiveRecord::StatementInvalid
      denied = true
    end
    raise "Runtime history/catalog permissions are too broad" unless denied
  end
  puts "PASS: restricted runtime role cannot edit/delete/truncate history or add global permissions"
ensure
  connection.execute("RESET ROLE")
  connection.execute("DROP OWNED BY #{role}")
  connection.execute("DROP ROLE #{role}")
end
