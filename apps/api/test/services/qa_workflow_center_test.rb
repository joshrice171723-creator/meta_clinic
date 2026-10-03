require "test_helper"
require_relative "../support/qa_workflow_contract_fixtures"

# Requires native Rails/PostgreSQL. NOT covered by the WASM contract check.
class QaWorkflowCenterTest < ActiveSupport::TestCase
  include QaWorkflowContractFixtures

  setup do
    @owner = User.create!(email_address: "workflow-center-owner@example.invalid", password: "Synthetic-workflow-only!", platform_owner: true, active: true)
    @token = Qa::ServiceToken.create!(user: @owner, recipient: "muse", scope: "office", name: "Synthetic workflow principal", digest: Digest::SHA256.hexdigest(SecureRandom.hex(32)))
    Qa::Snapshot.put("office:bindings", { "config" => { "QA_OFFICE_ACTORS_ENABLED" => "1", "QA_OFFICE_MUSE_TOKEN_ID" => @token.id.to_s, "QA_OFFICE_JOSH_USER_ID" => @owner.id.to_s } })
    @principal = Qa::OfficeWork.identity(@owner, @token)
    @practice = Clinic::Practice.create!(name: "Independently synthetic workflow test")
    Clinic::Membership.create!(practice: @practice, user: @owner)
    @registry = Qa::Event.create!(user: @owner, event_key: "synthetic-workflow-registry", kind: "workflow_fixture_verified", summary: "Synthetic fixture verification",
      payload: { schema_version: 1, practice_id: @practice.id, workflow_ids: ["WF-001"], principal_keys: [@principal[:key]], fixture_keys: ["synthetic_empty_board"], verification_ref: "independent-test-provenance" })
    @revision = "d" * 40
    @build = { "revision" => @revision, "dirty" => false }
    Qa::Snapshot.put("pin", { "revision" => @revision })
    catalog["workflows"].first["evidence_spec"] = [{ "step_id" => "open", "kind" => "text", "required" => true }]
    @input = { "request_key" => "synthetic-claim-001", "workflow_id" => "WF-001", "baseline_sha" => "c" * 40,
      "target_sha" => @revision, "catalog_digest" => Qa::WorkflowContract.fingerprint(catalog) }
    Qa::Event.create!(user: @owner, event_key: "workflow-impact:#{'c' * 40}:#{@revision}", kind: "workflow_impact_published", summary: "Synthetic impact fixture",
      payload: { baselineSHA: "c" * 40, targetSHA: @revision, evidenceRefs: ["synthetic-diff"], workflows: [{ workflowId: "WF-001", status: "affected", reason: "Synthetic route change",
        sourcePaths: ["synthetic/example.rb"], evidenceRefs: ["synthetic-diff"], claimedFixIds: [] }] })
  end

  def with_test_activation
    # This test-only stub preserves the real Office identity checks. Source gate
    # remains closed; no environment flag, credential or live grant enables it.
    policy = ->(user:, token:, action:) { raise ArgumentError unless Qa::WorkflowCenterAccess::ACTIONS.include?(action); Qa::OfficeWork.identity(user, token) }
    with_qa_method(Qa::WorkflowCenterAccess, :authorize!, policy) do
      with_qa_method(Qa::WorkflowCatalog, :parse, ->(_content) { catalog }) do
        with_qa_method(Qa::Workspace, :build, -> { @build }) { yield }
      end
    end
  end

  def claim(input = @input)
    Qa::WorkflowCenter.claim!(user: @owner, token: @token, input:)
  end

  def observation(receipt)
    run = receipt.fetch("run")
    { "request_key" => "synthetic-evidence-001", "run_id" => run["run_id"], "workflow_id" => "WF-001", "step_id" => "open", "revision" => run["revision"],
      "observed_at" => Time.current.iso8601(6), "expected" => "Synthetic ready", "actual" => "Synthetic ready", "reported_outcome" => "passed",
      "artifact" => { "kind" => "text", "content" => "Independently synthetic visible text: ready" } }
  end

  def record(input)
    Qa::WorkflowCenter.record_evidence!(user: @owner, token: @token, input:)
  end

  test "closed gate creates no workflow state even for a bound principal" do
    assert_no_difference ["Qa::Event.count", "Qa::Snapshot.count"] do
      assert_raises(Qa::OfficeActorPolicy::Denied) { claim }
      assert_raises(Qa::OfficeActorPolicy::Denied) { record({}) }
    end
  end

  test "claim and text evidence are transactional retry safe and append only" do
    with_test_activation do
      receipt = claim
      assert_equal false, receipt["execution_authorized"]
      assert_no_difference "Qa::Event.count" do
        assert_equal receipt, claim
        old_title = catalog["workflows"].first["title"]
        catalog["workflows"].first["title"] = "Changed synthetic catalog title"
        assert_equal receipt, claim, "A prior receipt survives a catalog update"
        catalog["workflows"].first["title"] = old_title
      end
      input = observation(receipt)
      saved = record(input)
      assert_nil saved["accepted_verdict"]
      assert_equal @revision, saved["revision"]
      assert_no_difference "Qa::Event.count" do
        assert_equal saved, record(input)
        assert_raises(Qa::WorkflowEvidenceContract::Conflict) { record(input.merge("actual" => "Changed retry")) }
      end
      artifact = Qa::Event.find(saved["artifact_event_id"])
      assert_equal Digest::SHA256.hexdigest(input.dig("artifact", "content")), artifact.payload["digest"]
      assert_raises(ActiveRecord::StatementInvalid) do
        Qa::Event.transaction(requires_new: true) { Qa::Event.where(id: artifact.id).update_all(summary: "Must not change immutable history") }
      end
      assert_equal "Workflow text evidence: WF-001", artifact.reload.summary
    end
  end

  test "a second active claim conflicts and an expired lease has an immutable seal" do
    with_test_activation do
      first = claim
      second = @input.merge("request_key" => "synthetic-claim-002")
      assert_raises(Qa::WorkflowEvidenceContract::Conflict) { claim(second) }
      travel_to(Time.current + 901) do
        receipt = claim(second)
        assert_not_equal first.dig("run", "run_id"), receipt.dig("run", "run_id")
        assert_equal "lease_expired", Qa::Event.find_by!(event_key: "workflow-seal:#{first.dig('run', 'run_id')}").payload["reason"]
      end
    end
  end

  test "captured revision stays separate from claim revision and never becomes an accepted verdict" do
    with_test_activation do
      input = observation(claim).merge("revision" => "e" * 40)
      saved = record(input)
      assert_equal "e" * 40, saved["revision"]
      artifact = Qa::Event.find(saved["artifact_event_id"])
      observation = Qa::Event.find(saved["observation_event_id"])
      assert_equal "e" * 40, artifact.revision
      assert_equal @revision, observation.payload["claim_revision"]
      assert_nil saved["accepted_verdict"]
    end
  end

  test "deployment records a boundary and does not seal a still live claim" do
    with_test_activation do
      input = observation(claim)
      @build = { "revision" => "e" * 40, "dirty" => false }
      saved = record(input)
      assert_equal @revision, saved["revision"]
      assert_equal "observation_recorded", saved["seal_state"]
      assert_equal "deployment_changed", saved["build_boundary"]
      assert_nil saved["accepted_verdict"]
      assert_equal "claimed", Qa::Snapshot.find_by!(key: Qa::WorkflowCenter::LEASE_KEY).data.dig("run", "state")
      assert_no_difference "Qa::Event.count" do
        assert_equal saved, record(input)
      end
    end
  end

  test "a legacy pin cannot steal a claim or block observations" do
    with_test_activation do
      input = observation(claim)
      Qa::Snapshot.put("pin", { "revision" => "e" * 40 })
      assert_no_difference "Qa::Event.count" do
        assert_raises(Qa::WorkflowEvidenceContract::Conflict) { claim(@input.merge("request_key" => "mismatched-pin-claim")) }
      end
      receipt = record(input)
      assert_equal @revision, receipt["revision"]
      assert_equal "observation_recorded", receipt["seal_state"]
      assert_nil receipt["accepted_verdict"]
    end
  end

  test "unknown captured build remains explicit within the original claim" do
    with_test_activation do
      input = observation(claim).merge("revision" => "unobserved")
      @build = { "revision" => nil }
      receipt = record(input)
      assert_equal "unobserved", receipt["revision"]
      assert_equal "metadata_unavailable", receipt["build_boundary"]
      assert_nil receipt["accepted_verdict"]
    end
  end

  test "a deployment crossing back to capture revision remains visible in event and receipt" do
    with_test_activation do
      input = observation(claim)
      builds = [{ "revision" => "e" * 40 }, { "revision" => @revision }]
      saved = with_qa_method(Qa::Workspace, :build, -> { builds.shift }) { record(input) }
      assert_equal "deployment_changed", saved["build_boundary"]
      assert_equal ["e" * 40, @revision], saved["server_build_observations"].map { |item| item["revision"] }
      event = Qa::Event.find(saved["observation_event_id"])
      assert_equal "deployment_changed", event.payload["build_boundary"]
      assert_equal saved["server_build_observations"], event.payload["server_build_observations"]
      assert_equal @revision, event.revision
      assert_nil saved["accepted_verdict"]
    end
  end

  test "inactive membership denies claims and evidence" do
    with_test_activation do
      input = observation(claim)
      Clinic::Membership.find_by!(practice: @practice, user: @owner).update!(active: false)
      assert_no_difference "Qa::Event.count" do
        assert_raises(Qa::OfficeActorPolicy::Denied) { record(input) }
        assert_raises(Qa::OfficeActorPolicy::Denied) { claim(@input.merge("request_key" => "inactive-member-claim")) }
      end
    end
  end

  test "revoked registry and revoked bound principal cannot create observations" do
    with_test_activation do
      input = observation(claim)
      Qa::Event.create!(user: @owner, kind: "workflow_fixture_revoked", event_key: "synthetic-registry-revocation", summary: "Synthetic revocation", payload: { fixture_receipt_id: @registry.id })
      assert_no_difference "Qa::Event.count" do
        assert_raises(Qa::OfficeActorPolicy::Denied) { record(input) }
      end
      @token.update!(revoked_at: Time.current)
      assert_no_difference "Qa::Event.count" do
        assert_raises(Qa::OfficeActorPolicy::Denied) { claim(@input.merge("request_key" => "after-revocation")) }
      end
    end
  end
end
