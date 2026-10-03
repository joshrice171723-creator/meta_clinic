# Pure contracts only: ruby test/verification/qa_workflow_contract_test.rb
# No Rails boot, database, HTTP, credentials, grants or fixture writes.
require "minitest/autorun"
require_relative "../support/qa_workflow_contract_fixtures"
require_relative "../../app/services/qa/workflow_catalog"
require_relative "../../app/services/qa/workflow_evidence_contract"
require_relative "../../app/services/qa/office_actor_policy"
require_relative "../../app/services/qa/workflow_center_access"

class QaWorkflowContractTest < Minitest::Test
  C = Qa::WorkflowContract
  Catalog = Qa::WorkflowCatalog
  Evidence = Qa::WorkflowEvidenceContract

  include QaWorkflowContractFixtures

  def run_binding
    @run_binding ||= {
      "run_id" => "synthetic-run-001", "workflow_id" => "WF-001", "revision" => "d" * 40,
      "principal_key" => "service:900001:900002", "practice_id" => 900003, "fixture_receipt_id" => 900004,
      "catalog_digest" => C.fingerprint(catalog), "claimed_at" => "2026-10-02T12:00:00Z",
      "lease_expires_at" => "2026-10-02T12:15:00Z", "state" => "claimed"
    }
  end

  def request
    @request ||= {
      "request_key" => "synthetic-evidence-001", "run_id" => run_binding["run_id"], "workflow_id" => "WF-001", "step_id" => "open",
      "revision" => run_binding["revision"], "observed_at" => "2026-10-02T12:02:00Z", "expected" => "Synthetic ready",
      "actual" => "Synthetic ready", "reported_outcome" => "passed", "artifact_ids" => [900005]
    }
  end

  def artifacts
    [run_binding.slice("run_id", "workflow_id", "revision", "principal_key", "practice_id", "fixture_receipt_id", "catalog_digest").merge(
      "id" => 900005, "step_id" => "open", "digest" => "e" * 64)]
  end

  def append(history: [], input: request, run: run_binding, files: artifacts, live: run_binding["revision"], principal: run_binding["principal_key"], now: Time.iso8601("2026-10-02T12:03:00Z"))
    Evidence.append_observation(history:, input:, run:, artifacts: files, catalog:, live_revision: live, principal_key: principal, now:)
  end

  def test_real_catalog_is_truthfully_unconfigured
    data = Catalog.parse(File.read(File.expand_path("../../config/qa_workflow_catalog.json", __dir__)))
    assert_equal "unconfigured", data["state"]
    assert_empty data["workflows"]
    assert_nil data["source"]
    assert_raises(ArgumentError) { Catalog.fetch(data, "WF-001") }
  end

  def test_complete_synthetic_catalog_is_copied_and_deeply_frozen
    before = Marshal.dump(catalog)
    result = Catalog.validate(catalog)
    assert_equal 116, result["workflows"].length
    assert result.frozen?
    assert result["workflows"].first["steps"].first["expected"].first["value"].frozen?
    refute catalog.frozen?
    assert_equal before, Marshal.dump(catalog)
  end

  def test_partial_duplicate_or_different_catalog_ids_are_rejected
    variants = [catalog["workflows"].take(100), [*catalog["workflows"].take(115), catalog["workflows"].first],
      [*catalog["workflows"].take(115), catalog["workflows"].last.merge("id" => "WF-117")]]
    variants.each { |rows| assert_raises(ArgumentError) { Catalog.validate(catalog.merge("workflows" => rows)) } }
  end

  def test_unconfigured_cannot_hide_content_or_provenance
    assert_raises(ArgumentError) { Catalog.validate(catalog.merge("state" => "unconfigured")) }
    assert_raises(ArgumentError) { Catalog.validate(catalog.merge("state" => "unconfigured", "workflows" => [])) }
  end

  def test_duplicate_json_keys_and_unexpected_authority_fields_are_rejected
    assert_raises(ArgumentError) { Catalog.parse('{"schema_version":1,"schema_version":1,"state":"unconfigured","source":null,"workflows":[]}') }
    assert_raises(ArgumentError) { Catalog.validate(catalog.merge("token" => "not-a-real-token")) }
    assert_raises(ArgumentError) { Catalog.parse("[not-json") }
  end

  def test_ambiguous_steps_unknown_fixture_or_missing_required_evidence_are_rejected
    row = catalog["workflows"].first
    step = row["steps"].first
    variants = [row.merge("steps" => [step, step]), row.merge("steps" => [step.merge("fixture_key" => "not-declared")]),
      row.merge("steps" => [step.merge("action" => "fill")]), row.merge("steps" => [step.merge("route" => "https://example.invalid")]),
      row.merge("steps" => [step.merge("effect" => "write")]), row.merge("evidence_spec" => []),
      row.merge("evidence_spec" => [{ "step_id" => "missing", "kind" => "screenshot", "required" => true }])]
    variants.each { |bad| assert_raises(ArgumentError) { Catalog.validate_workflow(bad) } }
  end

  def test_claim_contract_requires_exact_pair_and_catalog_digest_without_actor_fields
    input = { "request_key" => "synthetic-claim-001", "workflow_id" => "WF-001", "baseline_sha" => "c" * 40,
      "target_sha" => "d" * 40, "catalog_digest" => C.fingerprint(catalog) }
    assert_equal input, Evidence.claim_request(input, catalog:)
    assert_raises(ArgumentError) { Evidence.claim_request(input.merge("target_sha" => "d" * 12), catalog:) }
    assert_raises(Evidence::Conflict) { Evidence.claim_request(input.merge("catalog_digest" => "f" * 64), catalog:) }
    assert_raises(ArgumentError) { Evidence.claim_request(input.merge("actor" => "muse"), catalog:) }
  end

  def test_append_preserves_inputs_and_cannot_accept_a_reported_pass
    history = []
    before = Marshal.dump([request, run_binding, history])
    output = append(history:)
    assert_equal before, Marshal.dump([request, run_binding, history])
    assert_equal 1, output.length
    event = output.first
    assert_equal run_binding["revision"], event["revision"]
    assert_equal "passed", event.dig("payload", "reported_outcome")
    assert_nil event.dig("payload", "accepted_verdict")
    assert_equal "reported", event.dig("payload", "provenance")
    assert_equal "observation_recorded", event.dig("payload", "seal_state")
    assert event["payload"].frozen?
    assert_raises(FrozenError) { event["payload"]["actual"].replace("changed") }
  end

  def test_same_key_replay_is_stable_after_deployment_and_lease_expiry
    first = append
    assert_equal first, append(history: first, live: "f" * 40, now: Time.iso8601("2026-10-02T13:00:00Z"))
    assert_raises(Evidence::Conflict) { append(history: first, input: request.merge("actual" => "Different observation")) }
    assert_raises(Evidence::Conflict) { append(history: first, run: run_binding.merge("practice_id" => 900006)) }
  end

  def test_missing_stored_binding_cannot_satisfy_replay
    previous = JSON.parse(JSON.generate(append))
    previous.first["payload"].delete("practice_id")
    assert_raises(Evidence::Conflict) { append(history: previous) }
  end

  def test_changed_or_unavailable_live_build_preserves_old_pin_as_interrupted
    ["f" * 40, nil].each do |live|
      result = append(live:).first
      assert_equal run_binding["revision"], result["revision"]
      assert_equal "observation_recorded", result.dig("payload", "seal_state")
      assert_nil result.dig("payload", "accepted_verdict")
      assert_equal live ? "deployment_changed" : "metadata_unavailable", result.dig("payload", "build_boundary")
    end
  end

  def test_every_artifact_must_match_exact_run_workflow_pin_principal_and_tenant
    %w[run_id workflow_id revision principal_key practice_id fixture_receipt_id catalog_digest step_id].each do |field|
      files = artifacts.map { |item| item.merge(field => "different") }
      assert_raises(Evidence::Conflict, field) { append(files:) }
    end
    assert_raises(ArgumentError) { append(files: []) }
    assert_raises(Evidence::Conflict) { append(files: [*artifacts, *artifacts]) }
  end

  def test_other_principal_wrong_pin_or_unknown_step_is_rejected
    assert_raises(Evidence::Conflict) { append(principal: "owner:900007") }
    assert_raises(Evidence::Conflict) { append(input: request.merge("revision" => "f" * 40)) }
    assert_raises(Evidence::Conflict) { append(input: request.merge("step_id" => "unknown")) }
  end

  def test_observation_after_deployment_preserves_captured_artifact_and_claim_revisions
    captured = "f" * 40
    result = append(input: request.merge("revision" => captured), files: artifacts.map { |item| item.merge("revision" => captured) }, live: captured).first
    assert_equal captured, result["revision"]
    assert_equal run_binding["revision"], result.dig("payload", "claim_revision")
    assert_equal "same_observed_revision", result.dig("payload", "build_boundary")
    assert_equal "observation_recorded", result.dig("payload", "seal_state")
    assert_nil result.dig("payload", "accepted_verdict")
  end

  def test_unknown_capture_metadata_is_explicit_and_does_not_block_bound_evidence
    result = append(input: request.merge("revision" => "unobserved"), files: artifacts.map { |item| item.merge("revision" => "unobserved") }, live: nil).first
    assert_equal "unobserved", result["revision"]
    assert_equal run_binding["revision"], result.dig("payload", "claim_revision")
    assert_equal "metadata_unavailable", result.dig("payload", "build_boundary")
    assert_nil result.dig("payload", "accepted_verdict")
  end

  def test_request_cannot_supply_authority_synthetic_status_or_verdict
    %w[actor principal_key practice_id synthetic accepted_verdict].each do |field|
      assert_raises(ArgumentError) { append(input: request.merge(field => true)) }
    end
  end

  def test_completed_run_expired_lease_and_future_or_outside_claim_observation_are_rejected
    assert_raises(Evidence::Conflict) { append(run: run_binding.merge("state" => "completed")) }
    assert_raises(Evidence::Conflict) { append(now: Time.iso8601("2026-10-02T12:16:00Z")) }
    %w[2026-10-02T11:59:00Z 2026-10-02T12:04:00Z 2026-10-02T12:16:00Z].each do |time|
      assert_raises(Evidence::Conflict) { append(input: request.merge("observed_at" => time)) }
    end
  end

  def test_manual_nonreproduction_remains_inconclusive
    result = append(input: request.merge("reported_outcome" => "inconclusive", "actual" => "Manual non-reproduction; race analysis pending"))
    assert_equal "inconclusive", result.first.dig("payload", "reported_outcome")
    assert_nil result.first.dig("payload", "accepted_verdict")
  end
end

class QaWorkflowCenterAccessTest < Minitest::Test
  include QaWorkflowContractFixtures
  def test_even_a_resolved_binding_cannot_activate_new_actions
    created_double = !Qa.const_defined?(:OfficeWork)
    if created_double
      Qa.const_set(:OfficeWork, Class.new do
        def self.identity(*) = nil
      end)
    end
    calls = 0
    identity = lambda do |*_args|
      calls += 1
      { key: "synthetic-bound-principal" }
    end
    with_qa_method(Qa::OfficeWork, :identity, identity) do
      %w[record_evidence claim_workflow].each do |action|
        assert_raises(Qa::OfficeActorPolicy::Denied) { Qa::WorkflowCenterAccess.authorize!(user: nil, token: nil, action:) }
      end
      assert_raises(ArgumentError) { Qa::WorkflowCenterAccess.authorize!(user: nil, token: nil, action: "reset") }
    end
    assert_equal 2, calls
  ensure
    Qa.send(:remove_const, :OfficeWork) if created_double
  end
end
