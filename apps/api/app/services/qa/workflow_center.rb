require "securerandom"

module Qa
  # All writes remain unreachable through the permanently closed action gate.
  # The snapshot serializes this workflow-center's claims, not legacy task runs.
  class WorkflowCenter
    LEASE_KEY = "workflow-center:lease".freeze
    C = WorkflowContract
    Conflict = WorkflowEvidenceContract::Conflict

    def self.claim!(user:, token:, input:)
      WorkflowCenterAccess.authorize!(user:, token:, action: "claim_workflow")
      request = C.immutable_copy(WorkflowEvidenceContract.claim_fields!(input))
      AgentRoom.reject_credentials!(request)
      locked(user:, token:, action: "claim_workflow") do |principal, lease|
        key = "workflow-claim:#{principal[:key]}:#{request['request_key']}"
        digest = C.fingerprint(request)
        prior = Event.find_by(event_key: key)
        if prior
          check_replay!(prior, "workflow_claimed", principal, digest)
          next prior.payload.fetch("receipt")
        end
        catalog = WorkflowCatalog.parse(Rails.root.join("config/qa_workflow_catalog.json").read)
        WorkflowEvidenceContract.claim_request(request, catalog:)
        workflow = WorkflowCatalog.fetch(catalog, request["workflow_id"])
        registry = WorkflowFixtureRegistry.resolve!(workflow:, principal:, user:)
        scope_event = Event.find_by(event_key: "workflow-impact:#{request['baseline_sha']}:#{request['target_sha']}", kind: "workflow_impact_published")
        raise Conflict, "No server-recorded exact-pair impact manifest is available." unless scope_event
        scope = scope_event.payload
        build = clean_build!
        now = Time.current
        plan = WorkflowClaimContract.plan(input: request, catalog:, scope:, principal:, registry:,
          active_run: lease.data["run"], revision: build["revision"], pin_revision: nil, now:, run_id: "workflow-#{SecureRandom.uuid}")
        if plan["prior_transition"]
          seal!(user:, run: lease.data.fetch("run"), reason: plan["prior_transition"]["reason"])
        end
        archive_catalog!(user:, catalog:)
        run = plan.fetch("run")
        receipt = { "run" => run, "delivery" => "claim_recorded", "execution_authorized" => false, "submission_build_observation" => build }
        Event.create!(user:, event_key: key, kind: "workflow_claimed", summary: "Workflow claim recorded: #{run['workflow_id']}", revision: run["revision"],
          payload: { "principal_key" => principal[:key], "request_digest" => digest, "receipt" => receipt,
            "scope_event_id" => scope_event.id, "scope_digest" => C.fingerprint(scope) })
        lease.update!(data: { "run" => run })
        WorkflowCenterAccess.authorize!(user:, token:, action: "claim_workflow")
        receipt
      end
    end

    def self.record_evidence!(user:, token:, input:)
      WorkflowCenterAccess.authorize!(user:, token:, action: "record_evidence")
      C.object!(input, %w[request_key run_id workflow_id step_id revision observed_at expected actual reported_outcome artifact])
      artifact_input = C.object!(input["artifact"], %w[kind content])
      raise ArgumentError, "This slice accepts bounded text evidence only." unless artifact_input["kind"] == "text"
      C.text!(artifact_input["content"], maximum: 8000)
      WorkflowEvidenceContract.observation_details!(input.except("artifact"))
      AgentRoom.reject_credentials!(input)
      locked(user:, token:, action: "record_evidence") do |principal, lease|
        run_id = input.fetch("run_id")
        claim = Event.where(kind: "workflow_claimed").where("payload -> 'receipt' -> 'run' ->> 'run_id' = ?", run_id).sole
        run = claim.payload.fetch("receipt").fetch("run")
        raise OfficeActorPolicy::Denied, "Only the original claiming principal may attach evidence." unless run["principal_key"] == principal[:key] && claim.user_id == user.id
        key = "workflow-evidence-commit:#{run_id}:#{input['request_key']}"
        digest = C.fingerprint(input)
        if (prior = Event.find_by(event_key: key))
          check_replay!(prior, "workflow_evidence_committed", principal, digest)
          next prior.payload.fetch("receipt")
        end
        catalog_event = Event.find_by!(event_key: "workflow-catalog:#{run['catalog_digest']}", kind: "workflow_catalog_archived")
        catalog = catalog_event.payload
        workflow = WorkflowCatalog.fetch(catalog, run["workflow_id"])
        registry_receipt = Event.find(run["fixture_receipt_id"])
        WorkflowFixtureRegistry.verify!(receipt: registry_receipt, workflow:, principal:, user:)
        raise Conflict, "Step does not declare text evidence." unless workflow["evidence_spec"].any? { |item| item["step_id"] == input["step_id"] && item["kind"] == "text" }
        sealed = Event.exists?(event_key: "workflow-seal:#{run_id}", kind: "workflow_run_sealed")
        run = run.merge("state" => "interrupted") if sealed
        build_before = Workspace.build_observation(reported_revision: input["revision"])
        artifact = Event.create!(user:, event_key: "workflow-artifact:#{run_id}:#{input['request_key']}", kind: "workflow_artifact_recorded",
          summary: "Workflow text evidence: #{run['workflow_id']}", revision: input["revision"], payload: artifact_input.merge(
            run.slice("run_id", "workflow_id", "principal_key", "practice_id", "fixture_receipt_id", "catalog_digest"),
            "step_id" => input["step_id"], "digest" => Digest::SHA256.hexdigest(artifact_input["content"]), "observed_at" => input["observed_at"]))
        build_after = Workspace.build_observation(reported_revision: input["revision"])
        observed = build_after["revision"]
        artifact_data = artifact.payload.merge("id" => artifact.id, "revision" => artifact.revision)
        history = WorkflowEvidenceContract.append_observation(history: [], input: input.except("artifact").merge("artifact_ids" => [artifact.id]),
          run:, artifacts: [artifact_data], catalog:, live_revision: observed, principal_key: principal[:key], now: Time.current)
        event = history.fetch(0)
        boundary = if input["revision"] == "unobserved" || [build_before, build_after].any? { |item| item["revision"].nil? }
          "metadata_unavailable"
        elsif [build_before, build_after].any? { |item| item["revision"] != input["revision"] }
          "deployment_changed"
        else
          "same_observed_revision"
        end
        event = event.merge("payload" => event.fetch("payload").merge(
          "build_boundary" => boundary, "server_build_observations" => [build_before, build_after]))
        observation = Event.create!(user:, **event.symbolize_keys, summary: "Workflow observation recorded: #{run['workflow_id']}")
        receipt = { "observation_event_id" => observation.id, "artifact_event_id" => artifact.id, "revision" => input["revision"],
          "seal_state" => event.dig("payload", "seal_state"), "accepted_verdict" => nil, "delivery" => "evidence_recorded",
          "build_boundary" => boundary, "server_build_observations" => [build_before, build_after] }
        Event.create!(user:, event_key: key, kind: "workflow_evidence_committed", summary: "Workflow evidence receipt: #{run['workflow_id']}", revision: input["revision"],
          payload: { "principal_key" => principal[:key], "request_digest" => digest, "receipt" => receipt })
        WorkflowCenterAccess.authorize!(user:, token:, action: "record_evidence")
        receipt
      end
    end

    def self.locked(user:, token:, action:)
      OfficeWork.locked(user, token) do
        WorkflowCenterAccess.authorize!(user:, token:, action:)
        # Enrollment uses the same user -> bindings lock order. No binding edits.
        bindings = Snapshot.find_by!(key: "office:bindings")
        bindings.with_lock do
          principal = OfficeWork.identity(user, token)
          Snapshot.insert_all([{ key: LEASE_KEY, data: {}, created_at: Time.current, updated_at: Time.current }], unique_by: :key)
          lease = Snapshot.find_by!(key: LEASE_KEY)
          lease.with_lock do
            yield principal, lease
          end
        end
      end
    end

    def self.check_replay!(event, kind, principal, digest)
      unless event.kind == kind && event.payload["principal_key"] == principal[:key] && event.payload["request_digest"] == digest
        raise Conflict, "Request key records different content or identity."
      end
    end

    def self.archive_catalog!(user:, catalog:)
      digest = C.fingerprint(catalog)
      key = "workflow-catalog:#{digest}"
      if (event = Event.find_by(event_key: key))
        raise Conflict, "Catalog archive does not match its digest." unless event.kind == "workflow_catalog_archived" && C.fingerprint(event.payload) == digest
      else
        Event.create!(user:, event_key: key, kind: "workflow_catalog_archived", summary: "Workflow definition archive", payload: catalog)
      end
    end

    def self.seal!(user:, run:, reason:)
      key = "workflow-seal:#{run['run_id']}"
      return if Event.exists?(event_key: key, kind: "workflow_run_sealed")
      Event.create!(user:, event_key: key, kind: "workflow_run_sealed", summary: "Workflow run interrupted: #{run['workflow_id']}", revision: run["revision"],
        payload: { "run_id" => run["run_id"], "principal_key" => run["principal_key"], "reason" => reason })
    end

    def self.clean_build!
      Workspace.build_observation
    end

    private_class_method :locked, :check_replay!, :archive_catalog!, :seal!, :clean_build!
  end
end
