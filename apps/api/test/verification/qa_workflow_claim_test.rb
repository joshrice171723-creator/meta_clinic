require_relative "qa_workflow_contract_test"
require_relative "../../app/services/qa/workflow_claim_contract"
require_relative "../../app/services/qa/workflow_fixture_registry"

class QaWorkflowClaimTest < Minitest::Test
  def setup
    # Reuse independently synthetic definitions, never a live catalog.
    @fixture = QaWorkflowContractTest.new("synthetic_fixture_only")
    @catalog = @fixture.catalog
    @workflow = @catalog["workflows"].first
    @principal = { key: "service:900001:900002", name: "muse" }
    @registry = { "practice_id" => 900003, "fixture_receipt_id" => 900004 }
    @input = { "request_key" => "synthetic-claim-001", "workflow_id" => "WF-001", "baseline_sha" => "c" * 40,
      "target_sha" => "d" * 40, "catalog_digest" => Qa::WorkflowContract.fingerprint(@catalog) }
    @scope = { "baselineSHA" => "c" * 40, "targetSHA" => "d" * 40, "evidenceRefs" => ["synthetic-change-review"], "workflows" => [
      { "workflowId" => "WF-001", "status" => "affected", "reason" => "Synthetic changed route", "sourcePaths" => ["synthetic/route.rb"], "evidenceRefs" => ["synthetic-diff"], "claimedFixIds" => [] }] }
    @now = Time.iso8601("2026-10-02T12:00:00Z")
  end

  def plan(active: nil, now: @now, revision: "d" * 40, pin: "d" * 40)
    Qa::WorkflowClaimContract.plan(input: @input, catalog: @catalog, scope: @scope, principal: @principal, registry: @registry,
      active_run: active, revision:, pin_revision: pin, now:, run_id: "synthetic-run-001")
  end

  def test_offline_scope_to_claim_to_exact_pin_observation_and_replay
    result = plan
    assert_nil result["prior_transition"]
    run = result.fetch("run")
    assert_equal @registry["practice_id"], run["practice_id"]
    assert_equal 900, Time.iso8601(run["lease_expires_at"]) - @now
    request = @fixture.request
    artifacts = @fixture.artifacts
    history = Qa::WorkflowEvidenceContract.append_observation(history: [], input: request, run:, artifacts:, catalog: @catalog,
      live_revision: run["revision"], principal_key: @principal[:key], now: @now + 180)
    assert_equal run["revision"], history.first["revision"]
    assert_nil history.first.dig("payload", "accepted_verdict")
    replay = Qa::WorkflowEvidenceContract.append_observation(history:, input: request, run:, artifacts:, catalog: @catalog,
      live_revision: "f" * 40, principal_key: @principal[:key], now: @now + 3600)
    assert_equal history, replay
  end

  def test_live_competing_claim_conflicts_until_lease_expires
    original = plan.fetch("run")
    assert_raises(Qa::WorkflowClaimContract::Conflict) { plan(active: original, now: @now + 899) }
    expired = plan(active: original, now: @now + 900)
    assert_equal "lease_expired", expired.dig("prior_transition", "reason")
    assert_equal original["revision"], expired.dig("prior_transition", "revision")
  end

  def test_deployment_or_missing_metadata_does_not_release_another_claim
    original = plan.fetch("run").merge("revision" => "b" * 40)
    assert_raises(Qa::WorkflowClaimContract::Conflict) { plan(active: original) }
    assert_raises(Qa::WorkflowClaimContract::Conflict) { plan(active: original, revision: nil, pin: nil) }
    assert_equal "d" * 40, plan(revision: nil, pin: nil).dig("run", "revision")
    assert_equal "d" * 40, plan(pin: "e" * 40).dig("run", "revision")
  end

  def test_missing_or_untouched_scope_is_not_claimable_but_explicit_fix_claim_is
    row = @scope["workflows"].first
    @scope["workflows"] = []
    assert_raises(Qa::WorkflowClaimContract::Conflict) { plan }
    @scope["workflows"] = [row.merge("status" => "untouched")]
    assert_raises(Qa::WorkflowClaimContract::Conflict) { plan }
    @scope["workflows"] = [row.merge("status" => "unknown", "claimedFixIds" => [900010])]
    assert_equal "WF-001", plan.dig("run", "workflow_id")
    assert_equal "unknown", @scope["workflows"].first["status"]
  end

  def test_wrong_pair_or_duplicate_workflow_cannot_claim
    @scope["workflows"] *= 2
    assert_raises(ArgumentError) { plan }
    @scope["workflows"] = @scope["workflows"].take(1)
    @scope["targetSHA"] = "e" * 40
    assert_raises(Qa::WorkflowClaimContract::Conflict) { plan }
  end

  def test_bound_actor_must_also_match_catalog_owner_policy
    @principal = @principal.merge(name: "dot")
    assert_raises(Qa::WorkflowClaimContract::Conflict) { plan }
  end

  def test_registry_scope_cannot_be_replaced_by_a_prefix_or_client_synthetic_boolean
    data = { "schema_version" => 1, "practice_id" => 900003, "workflow_ids" => ["WF-001"], "principal_keys" => [@principal[:key]],
      "fixture_keys" => ["synthetic_empty_board"], "verification_ref" => "synthetic-server-review" }
    assert_equal data, Qa::WorkflowFixtureRegistry.validate_scope!(data:, workflow: @workflow, principal: @principal)
    assert_raises(ArgumentError) { Qa::WorkflowFixtureRegistry.validate_scope!(data: data.merge("synthetic" => true), workflow: @workflow, principal: @principal) }
    assert_raises(Qa::OfficeActorPolicy::Denied) { Qa::WorkflowFixtureRegistry.validate_scope!(data: data.merge("fixture_keys" => ["SYN-prefix-only"]), workflow: @workflow, principal: @principal) }
    assert_raises(Qa::OfficeActorPolicy::Denied) { Qa::WorkflowFixtureRegistry.validate_scope!(data: data.merge("principal_keys" => ["owner:900099"]), workflow: @workflow, principal: @principal) }
  end
end
