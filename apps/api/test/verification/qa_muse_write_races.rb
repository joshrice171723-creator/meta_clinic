# Runs only against the caller's explicitly generated synthetic scratch database.
name = ENV.fetch("APPLY_MUSE_VERIFY_DATABASE")
abort "Generated Muse scratch database required" unless name.match?(/\Amuse_qa_verify_[0-9a-f]{12}\z/) && ApplicationRecord.connection_db_config.database == name

owner = User.create!(email_address: "muse-race-#{SecureRandom.hex(5)}@example.invalid", password: SecureRandom.hex(24), platform_owner: true, active: true)
key = OpenSSL::PKey.generate_key("ED25519")
credential = Qa::MuseCredential.create!(user: owner, approved_by: owner, identity: "muse", public_key_pem: key.public_to_pem,
  fingerprint: Qa::MuseCredential.fingerprint_for(key), scopes: Qa::MuseCredential::SCOPES)
practice = Clinic::Practice.create!(name: "Independently synthetic Muse concurrency fixture")
Clinic::Membership.create!(practice:, user: owner)
Qa::Event.create!(user: owner, kind: "workflow_fixture_verified", event_key: "muse-race-fixture", summary: "Independent concurrency fixture provenance",
  payload: { schema_version: 1, practice_id: practice.id, workflow_ids: %w[WF-001 WF-002], principal_keys: ["muse"], fixture_keys: [], verification_ref: "independently-created-empty-practice" })
revision = "d" * 40
Qa::Snapshot.put("pin", { "revision" => revision, "confirmed_by" => owner.email_address })
Qa::Snapshot.put(Qa::OfficeQa::KEY, { "defects" => [], "coverage" => [], "batches" => [] })
original = Qa::Workspace.method(:build)
Qa::Workspace.define_singleton_method(:build) { { "revision" => revision, "dirty" => false } }

race = lambda do |&operation|
  ready = Queue.new
  go = Queue.new
  threads = 2.times.map do
    Thread.new do
      ApplicationRecord.connection_pool.with_connection do |connection|
        pid = connection.select_value("SELECT pg_backend_pid()")
        bound = Qa::MuseCredential.find(credential.id)
        auth = Qa::MuseRequestAuthenticator::Request.new(nonce: SecureRandom.urlsafe_base64(24), timestamp: Time.current.to_i)
        ready << pid
        go.pop
        begin
          [:ok, operation.call(bound, auth)]
        rescue Qa::MuseWrites::Conflict
          [:conflict, nil]
        end
      end
    end
  end
  pids = 2.times.map { ready.pop }
  raise "Separate PostgreSQL sessions required" unless pids.uniq.length == 2
  2.times { go << true }
  threads.map(&:value)
end

begin
  input = { "workflow_id" => "WF-001", "build_pin" => revision, "idempotency_key" => "muse-race-verdict", "verdict" => "pass",
    "evidence" => [{ "kind" => "observation", "text" => "Independent synthetic concurrent receipt." }] }
  results = race.call { |bound, auth| Qa::MuseWrites.verdict!(credential: bound, auth:, input:) }
  raise "Concurrent retries did not share their receipt" unless results.all? { |status, _| status == :ok } && results.map(&:last).uniq.length == 1
  raise "Concurrent retry duplicated history" unless Qa::Event.where(kind: "muse_verdict_recorded").count == 1
  raise "Concurrent retry duplicated coverage" unless Qa::Snapshot.find_by!(key: Qa::OfficeQa::KEY).data["coverage"].count { |item| item["id"] == "WF-001" } == 1
  results = race.call do |bound, auth|
    Qa::MuseWrites.claim!(credential: bound, auth:, input: { "workflow_id" => "WF-002", "build_pin" => revision, "agent" => "Muse", "idempotency_key" => SecureRandom.uuid })
  end
  raise "Concurrent claims were not exclusive" unless results.map(&:first).sort == %i[conflict ok]
  puts "Muse native PostgreSQL races passed: one idempotent verdict receipt and one exclusive claim across independent sessions."
ensure
  Qa::Workspace.define_singleton_method(:build, original)
end
