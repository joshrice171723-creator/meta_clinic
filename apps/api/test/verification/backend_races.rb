# Invoked only by bin/verify-backend on its own fresh database; not fixture tests.
raise "Test scratch database required" unless Rails.env.test? && ApplicationRecord.connection_db_config.database.start_with?("apply_backend_verify_")

practice = Development::BackendSamples.call.first
actor = practice.memberships.joins(:user).find_by!(users: { email_address: "synthetic-review-a-admin@example.invalid" }).user
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
note = Clinic::Care::CreateEncounterNote.call(practice: practice, actor: actor, encounter: encounter, encrypted_body: "Synthetic start")
results = race do |index|
  begin
    Clinic::Care::ReviseEncounterNote.call(note: Clinic::EncounterNote.find(note.id), actor: actor,
      encrypted_body: "Synthetic revision #{index}", expected_revision: 1)
    :accepted
  rescue ActiveRecord::StaleObjectError
    :stale
  end
end
raise "Concurrent note revisions lost history" unless results.sort == [ :accepted, :stale ] && note.revisions.count == 2
puts "PASS: simultaneous revisions reject the stale writer"

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
