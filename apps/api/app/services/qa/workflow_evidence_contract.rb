require_relative "workflow_catalog"

module Qa
  # Dormant, pure request/event contract. No route, storage, grants or execution.
  # run/artifacts/history are trusted server-loaded records, NEVER request input.
  # The future adapter must authorize, lock, verify synthetic tenancy and persist
  # atomically. This planner alone cannot establish any of those facts.
  class WorkflowEvidenceContract
    C = WorkflowContract
    class Conflict < StandardError; end

    def self.claim_fields!(input)
      C.object!(input, %w[request_key workflow_id baseline_sha target_sha catalog_digest])
      C.match!(input["request_key"], C::KEY)
      C.workflow!(input["workflow_id"])
      %w[baseline_sha target_sha].each { |field| C.match!(input[field], C::SHA) }
      raise ArgumentError, "Claim scope requires distinct exact revisions." if input["baseline_sha"] == input["target_sha"]
      C.match!(input["catalog_digest"], C::DIGEST)
      input
    end

    def self.claim_request(input, catalog:)
      claim_fields!(input)
      WorkflowCatalog.fetch(catalog, input["workflow_id"])
      raise Conflict, "Catalog changed; review the workflow before claiming." unless input["catalog_digest"] == C.fingerprint(catalog)
      C.immutable_copy(input)
    end

    def self.observation_details!(input)
      C.object!(input, %w[request_key run_id workflow_id step_id revision observed_at expected actual reported_outcome])
      %w[request_key run_id].each { |field| C.match!(input[field], C::KEY) }
      C.workflow!(input["workflow_id"])
      C.match!(input["step_id"], /\A[a-z][a-z0-9_-]{0,79}\z/)
      C.match!(input["revision"], /\A(?:[0-9a-f]{40}|unobserved)\z/)
      C.timestamp!(input["observed_at"])
      %w[expected actual].each { |field| C.text!(input[field], maximum: 5000) }
      raise ArgumentError, "Observation outcome is reported, never an accepted verdict." unless %w[passed failed blocked inconclusive].include?(input["reported_outcome"])
      input
    end

    def self.observation_request(input)
      C.object!(input, %w[request_key run_id workflow_id step_id revision observed_at expected actual reported_outcome artifact_ids])
      observation_details!(input.except("artifact_ids"))
      refs = C.list!(input["artifact_ids"], minimum: 1, maximum: 20)
      refs.each { |id| C.positive!(id) }
      raise ArgumentError, "Artifact IDs must be distinct." unless refs.uniq == refs
      C.immutable_copy(input)
    end

    def self.append_observation(history:, input:, run:, artifacts:, catalog:, live_revision:, principal_key:, now:)
      request = observation_request(input)
      validate_run!(run)
      raise Conflict, "Only the bound claiming principal can attach evidence." unless principal_key == run["principal_key"]
      raise ArgumentError, "Server time is required." unless now.is_a?(Time)
      %w[run_id workflow_id].each do |field|
        raise Conflict, "Evidence belongs to a different run, workflow or pin." unless request[field] == run[field]
      end
      event_key = "workflow-evidence:#{run['run_id']}:#{request['request_key']}"
      digest = C.fingerprint(request)
      C.list!(history, maximum: 10_000)
      previous = history.select { |item| item["event_key"] == event_key }
      raise Conflict, "Duplicate stored event keys." if previous.length > 1
      if previous.first
        recorded = previous.first
        binding_fields = %w[principal_key practice_id fixture_receipt_id catalog_digest run_id workflow_id]
        binding = recorded.fetch("payload").slice(*binding_fields)
        unless recorded["kind"] == "workflow_observation_recorded" && recorded["revision"] == request["revision"] &&
            recorded.dig("payload", "request_digest") == digest && binding == run.slice(*binding_fields)
          raise Conflict, "Idempotency key records different content or binding."
        end
        return C.immutable_copy(history)
      end
      workflow = WorkflowCatalog.fetch(catalog, run["workflow_id"])
      raise Conflict, "Use the immutable catalog revision bound to this run." unless run["catalog_digest"] == C.fingerprint(catalog)
      raise Conflict, "Step is absent from the bound workflow." unless workflow["steps"].any? { |step| step["id"] == request["step_id"] }
      observed = C.timestamp!(request["observed_at"])
      started = C.timestamp!(run["claimed_at"])
      expires = C.timestamp!(run["lease_expires_at"])
      raise Conflict, "Observation must fall within the claimed lease and not in the future." unless observed >= started && observed <= expires && observed <= now
      raise Conflict, "Evidence cannot be appended to a finished run." unless %w[claimed interrupted].include?(run["state"])
      C.match!(live_revision, C::SHA) unless live_revision.nil?
      boundary = if live_revision.nil? || request["revision"] == "unobserved"
        "metadata_unavailable"
      elsif live_revision != request["revision"]
        "deployment_changed"
      else
        "same_observed_revision"
      end
      raise Conflict, "Lease expired; acquire a new run for new observations." if expires <= now
      unless C.list!(artifacts, minimum: 1, maximum: 20).map { |item| item["id"] }.sort == request["artifact_ids"].sort
        raise Conflict, "Resolve every artifact exactly once from server storage."
      end
      artifacts.each do |artifact|
        %w[run_id workflow_id principal_key practice_id fixture_receipt_id catalog_digest].each do |field|
          raise Conflict, "Artifact binding differs from the run." unless artifact[field] == run[field]
        end
        raise Conflict, "Artifact revision differs from its reported capture revision." unless artifact["revision"] == request["revision"]
        raise Conflict, "Artifact belongs to another step." unless artifact["step_id"] == request["step_id"]
        C.match!(artifact["digest"], C::DIGEST)
      end
      event = {
        "event_key" => event_key, "kind" => "workflow_observation_recorded", "revision" => request["revision"],
        "payload" => run.slice("run_id", "workflow_id", "principal_key", "practice_id", "fixture_receipt_id", "catalog_digest").merge(
          "schema_version" => 1, "request_digest" => digest, "step_id" => request["step_id"],
          "observed_at" => request["observed_at"], "recorded_at" => now.getutc.iso8601(6),
          "expected" => request["expected"], "actual" => request["actual"], "reported_outcome" => request["reported_outcome"],
          "artifact_ids" => request["artifact_ids"], "artifact_digests" => artifacts.sort_by { |item| item["id"] }.map { |item| item.slice("id", "digest") },
          "build_at_receipt" => live_revision, "claim_revision" => run["revision"], "build_boundary" => boundary,
          "seal_state" => run["state"] == "interrupted" ? "interrupted" : "observation_recorded",
          "provenance" => "reported", "accepted_verdict" => nil)
      }
      C.immutable_copy([*history, event])
    end

    def self.validate_run!(run)
      C.object!(run, %w[run_id workflow_id revision principal_key practice_id fixture_receipt_id catalog_digest claimed_at lease_expires_at state])
      C.match!(run["run_id"], C::KEY)
      C.workflow!(run["workflow_id"])
      C.match!(run["revision"], C::SHA)
      C.match!(run["catalog_digest"], C::DIGEST)
      C.text!(run["principal_key"], maximum: 100)
      C.positive!(run["practice_id"])
      C.positive!(run["fixture_receipt_id"])
      start = C.timestamp!(run["claimed_at"])
      expiry = C.timestamp!(run["lease_expires_at"])
      raise ArgumentError, "Invalid bounded claim lease." unless expiry > start && expiry - start <= 900
      raise ArgumentError, "Unknown run state." unless %w[claimed interrupted completed failed cancelled].include?(run["state"])
    end
  end
end
