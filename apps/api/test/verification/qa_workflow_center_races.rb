# Native PostgreSQL only, invoked by bin/verify-qa-workflow-center.
require "timeout"
require "active_support/testing/time_helpers"
require_relative "../support/qa_workflow_contract_fixtures"
extend QaWorkflowContractFixtures
extend ActiveSupport::Testing::TimeHelpers

expected_database = ENV.fetch("APPLY_QA_VERIFY_DATABASE")
actual_database = ApplicationRecord.connection_db_config.database
raise "Task-owned native QA scratch database required" unless Rails.env.test? && expected_database.match?(/\Aapply_qa_native_verify_[0-9a-f]{12}\z/) && actual_database == expected_database
raise "Empty synthetic scratch database required" unless User.count.zero? && Clinic::Practice.count.zero? && Qa::Event.count.zero? && Qa::Snapshot.count.zero?

# These are isolated test records, not credentials or actor grants in a live app.
owner = User.create!(email_address: "qa-native-race@example.invalid", password: "Synthetic-native-race-only!", active: true, platform_owner: true)
users = [owner, owner]
tokens = users.each_with_index.map do |user, index|
  Qa::ServiceToken.create!(user:, recipient: index.zero? ? "muse" : "codex", scope: "office", name: "Synthetic race #{index}", digest: Digest::SHA256.hexdigest("synthetic-race-#{index}"))
end
Qa::Snapshot.put("office:bindings", { "config" => { "QA_OFFICE_ACTORS_ENABLED" => "1", "QA_OFFICE_MUSE_TOKEN_ID" => tokens[0].id.to_s,
  "QA_OFFICE_DOT_TOKEN_ID" => tokens[1].id.to_s, "QA_OFFICE_JOSH_USER_ID" => users[0].id.to_s } })
principals = users.each_with_index.map { |user, index| Qa::OfficeWork.identity(user, tokens[index]) }
practice = Clinic::Practice.create!(name: "Independently synthetic native race fixture")
users.uniq.each { |user| Clinic::Membership.create!(practice:, user:) }
Qa::Event.create!(user: users[0], event_key: "native-race-registry", kind: "workflow_fixture_verified", summary: "Synthetic registry receipt",
  payload: { schema_version: 1, practice_id: practice.id, workflow_ids: ["WF-001"], principal_keys: principals.map { |p| p[:key] },
    fixture_keys: ["synthetic_empty_board"], verification_ref: "native-race-test-only" })
revision = "d" * 40
Qa::Snapshot.put("pin", { "revision" => revision })
Qa::Event.create!(user: users[0], event_key: "workflow-impact:#{'c' * 40}:#{revision}", kind: "workflow_impact_published", summary: "Synthetic impact",
  payload: { baselineSHA: "c" * 40, targetSHA: revision, evidenceRefs: ["synthetic-native-diff"], workflows: [{ workflowId: "WF-001", status: "affected",
    reason: "Independent synthetic changed route", sourcePaths: ["synthetic/route.rb"], evidenceRefs: ["synthetic-native-diff"], claimedFixIds: [] }] })
fixture_catalog = catalog
fixture_catalog["workflows"][0]["owner_policy"]["eligible_actors"] = %w[muse dot]
fixture_catalog["workflows"][0]["evidence_spec"] = [{ "step_id" => "open", "kind" => "text", "required" => true }]
request = { "workflow_id" => "WF-001", "baseline_sha" => "c" * 40, "target_sha" => revision, "catalog_digest" => Qa::WorkflowContract.fingerprint(fixture_catalog) }
base_time = Time.current.change(usec: 0)

def race
  ready, start = Queue.new, Queue.new
  threads = 2.times.map do |index|
    Thread.new do
      ApplicationRecord.connection_pool.with_connection do |connection|
        ready << connection.select_value("SELECT pg_backend_pid()")
        start.pop
        yield index
      end
    end
  end
  pids = Timeout.timeout(10) { 2.times.map { ready.pop } }
  raise "Two independent PostgreSQL connections were not used" unless pids.uniq.length == 2
  2.times { start << true }
  Timeout.timeout(15) { threads.map(&:value) }
ensure
  2.times { start << true } if start
  threads&.each { |thread| thread.join(1) }
end

# Prove a real PostgreSQL lock wait, then release it and check the outcome.
def while_locked(holder:, waiter:)
  ready, release, pid = Queue.new, Queue.new, Queue.new
  holding = Thread.new do
    ApplicationRecord.connection_pool.with_connection do
      holder.call(-> { ready << true; release.pop })
    end
  end
  Timeout.timeout(10) { ready.pop }
  waiting = Thread.new do
    ApplicationRecord.connection_pool.with_connection do |connection|
      pid << connection.select_value("SELECT pg_backend_pid()")
      waiter.call
    end
  end
  backend = Timeout.timeout(10) { pid.pop }
  Timeout.timeout(3) do
    loop do
      blocked = ApplicationRecord.connection.select_value("SELECT cardinality(pg_blocking_pids(#{Integer(backend)}))")
      break if blocked.positive?
      raise "Operation completed before the expected lock wait" unless waiting.alive?
      sleep 0.01
    end
  end
  release << true
  Timeout.timeout(10) { holding.value; waiting.value }
ensure
  release << true if release
  holding&.join(1)
  waiting&.join(1)
end

# Only this scratch-process seam opens writes; real Office identities remain checked.
test_gate = lambda do |user:, token:, action:|
  raise ArgumentError unless Qa::WorkflowCenterAccess::ACTIONS.include?(action)
  Qa::OfficeWork.identity(user, token)
end
claim = lambda do |index, key|
  Qa::WorkflowCenter.claim!(user: User.find(users[index].id), token: Qa::ServiceToken.find(tokens[index].id), input: request.merge("request_key" => key))
end

begin
ActiveRecord::Base.uncached do
with_qa_method(Qa::WorkflowCenterAccess, :authorize!, test_gate) do
  with_qa_method(Qa::WorkflowCatalog, :parse, ->(_content) { fixture_catalog }) do
    with_qa_method(Qa::Workspace, :build, -> { { "revision" => revision, "dirty" => false } }) do
      travel_to(base_time)
      result = race do |index|
        begin
          [index, claim.call(index, "native-compete-#{index}")]
        rescue Qa::WorkflowEvidenceContract::Conflict
          [index, :conflict]
        end
      end
      accepted = result.reject { |_, receipt| receipt == :conflict }
      raise "Competing principals acquired overlapping claims" unless accepted.length == 1 && Qa::Event.where(kind: "workflow_claimed").count == 1
      winner, receipt = accepted.first
      puts "PASS: two connections, different bound principals, exactly one active claim"
      replay = race { |_index| claim.call(winner, "native-compete-#{winner}") }
      raise "Concurrent retry duplicated or changed the claim" unless replay == [receipt, receipt] && Qa::Event.where(kind: "workflow_claimed").count == 1
      puts "PASS: concurrent identical retries return one immutable claim receipt"

      travel_to(base_time + 901)
      result = race do |index|
        begin
          claim.call(index, "native-takeover-#{index}")
        rescue Qa::WorkflowEvidenceContract::Conflict
          :conflict
        end
      end
      raise "Expired lease admitted overlapping takeovers" unless result.count(:conflict) == 1 && Qa::Event.where(kind: "workflow_claimed").count == 2
      raise "Expired run has no immutable seal" unless Qa::Event.find_by!(event_key: "workflow-seal:#{receipt.dig('run', 'run_id')}").payload["reason"] == "lease_expired"
      puts "PASS: expired lease takeover is exclusive and preserves the old run seal"

      travel_to(base_time + 1802)
      pin_result = while_locked(
        holder: ->(pause) { Qa::Snapshot.find_by!(key: "pin").with_lock { pause.call } },
        waiter: -> { claim.call(0, "native-pin-lock-order") })
      raise "Pin lock prevented a valid claim after release" unless pin_result["delivery"] == "claim_recorded"
      puts "PASS: claim waits for pin row lock and completes without lock inversion"

      travel_to(base_time + 2703)
      bindings_result = while_locked(
        holder: ->(pause) { Qa::OfficeWork.locked(User.find(users[0].id), nil) { Qa::Snapshot.find_by!(key: "office:bindings").with_lock { pause.call } } },
        waiter: -> { claim.call(1, "native-bindings-lock-order") })
      raise "Bindings lock prevented a valid claim after release" unless bindings_result["delivery"] == "claim_recorded"
      puts "PASS: claim respects the existing user-to-bindings lock order"

      run = bindings_result.fetch("run")
      Qa::Snapshot.put("pin", { "revision" => "e" * 40 })
      input = { "request_key" => "native-mismatched-pin", "run_id" => run["run_id"], "workflow_id" => run["workflow_id"], "step_id" => "open", "revision" => revision,
        "observed_at" => Time.current.iso8601, "expected" => "Synthetic ready", "actual" => "Synthetic ready", "reported_outcome" => "passed", "artifact" => { "kind" => "text", "content" => "Synthetic observed text" } }
      saved = Qa::WorkflowCenter.record_evidence!(user: User.find(users[1].id), token: Qa::ServiceToken.find(tokens[1].id), input:)
      raise "Mismatched pin promoted or lost old-pin evidence" unless saved["revision"] == revision && saved["seal_state"] == "interrupted_old_pin" && saved["accepted_verdict"].nil?
      raise "Existing claim was not sealed" unless Qa::Snapshot.find_by!(key: Qa::WorkflowCenter::LEASE_KEY).data.dig("run", "state") == "interrupted"
      puts "PASS: mismatched confirmed pin atomically seals evidence under the original pin"

      Qa::Snapshot.put("pin", { "revision" => revision })
      before = Qa::Event.count
      revoked = while_locked(
        holder: ->(pause) { token = Qa::ServiceToken.find(tokens[0].id); token.with_lock { pause.call; token.update!(revoked_at: Time.current) } },
        waiter: lambda do
          begin
            claim.call(0, "native-revoke-during-wait")
            :unexpected_claim
          rescue Qa::OfficeActorPolicy::Denied
            :denied
          end
        end)
      raise "Revocation during lock wait allowed a claim" unless revoked == :denied && Qa::Event.count == before
      puts "PASS: credential revocation is rechecked after the real database lock wait"
      before = Qa::Event.count
      membership_removed = while_locked(
        holder: ->(pause) { member = Clinic::Membership.find_by!(practice:, user: owner); member.with_lock { pause.call; member.destroy! } },
        waiter: lambda do
          begin
            claim.call(1, "native-membership-during-wait")
            :unexpected_claim
          rescue Qa::OfficeActorPolicy::Denied
            :denied
          end
        end)
      raise "Membership removal during lock wait allowed a claim" unless membership_removed == :denied && Qa::Event.count == before
      puts "PASS: membership removal during a real row-lock wait denies the claim"
      raise "Historical Muse mirror was modified" if Qa::Snapshot.exists?(key: Qa::OfficeQa::KEY)
    end
  end
end
end
puts "PASS: native PostgreSQL workflow-center concurrency checks complete; no execution/verdict granted"
ensure
  travel_back
end
