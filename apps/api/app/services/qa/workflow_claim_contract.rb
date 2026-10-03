require_relative "workflow_evidence_contract"

module Qa
  # Pure claim decision; storage adapter owns identity, registry, locks and time.
  class WorkflowClaimContract
    C = WorkflowContract
    Conflict = WorkflowEvidenceContract::Conflict

    def self.scope!(scope, input)
      C.object!(scope, %w[baselineSHA targetSHA evidenceRefs workflows])
      %w[baselineSHA targetSHA].each { |key| C.match!(scope[key], C::SHA) }
      unless scope["baselineSHA"] == input["baseline_sha"] && scope["targetSHA"] == input["target_sha"]
        raise Conflict, "Impact scope does not match the exact release pair."
      end
      C.strings!(scope["evidenceRefs"], minimum: 1, maximum: 100)
      rows = C.list!(scope["workflows"])
      rows.each do |row|
        C.object!(row, %w[workflowId status reason sourcePaths evidenceRefs claimedFixIds])
        C.workflow!(row["workflowId"])
        raise ArgumentError, "Unknown impact classification." unless %w[affected untouched unknown].include?(row["status"])
        C.text!(row["reason"])
        C.strings!(row["sourcePaths"], maximum: 100)
        C.strings!(row["evidenceRefs"], minimum: 1, maximum: 100)
        ids = C.list!(row["claimedFixIds"], maximum: 100)
        ids.each { |id| C.positive!(id) }
        raise ArgumentError, "Duplicate claimed-fix IDs." unless ids.uniq == ids
      end
      ids = rows.map { |row| row["workflowId"] }
      raise ArgumentError, "Ambiguous impact mapping." unless ids.uniq == ids
      row = rows.find { |item| item["workflowId"] == input["workflow_id"] }
      unless row && (row["status"] == "affected" || !row["claimedFixIds"].empty?)
        raise Conflict, "Workflow is outside affected/claimed-fix scope; missing impact stays unknown."
      end
      C.immutable_copy(scope)
    end

    def self.plan(input:, catalog:, scope:, principal:, registry:, active_run:, revision:, pin_revision:, now:, run_id:)
      request = WorkflowEvidenceContract.claim_request(input, catalog:)
      scope!(scope, request)
      workflow = WorkflowCatalog.fetch(catalog, input["workflow_id"])
      unless workflow["owner_policy"]["eligible_actors"].include?(principal.fetch(:name))
        raise Conflict, "Bound actor is outside this workflow's owner policy."
      end
      C.text!(principal.fetch(:key), maximum: 100)
      C.object!(registry, %w[practice_id fixture_receipt_id])
      registry.each_value { |value| C.positive!(value) }
      raise ArgumentError, "Server time is required." unless now.is_a?(Time)
      transition = nil
      if active_run
        WorkflowEvidenceContract.validate_run!(active_run)
        if active_run["state"] == "claimed"
          expires = C.timestamp!(active_run["lease_expires_at"])
          if expires > now
            raise Conflict, "Another workflow claim still holds the lease."
          end
          transition = { "run_id" => active_run["run_id"], "revision" => active_run["revision"],
            "reason" => "lease_expired" }
        end
      end
      C.match!(run_id, C::KEY)
      run = { "run_id" => run_id, "workflow_id" => request["workflow_id"], "revision" => request["target_sha"],
        "principal_key" => principal.fetch(:key), "practice_id" => registry["practice_id"], "fixture_receipt_id" => registry["fixture_receipt_id"],
        "catalog_digest" => request["catalog_digest"], "claimed_at" => now.getutc.iso8601(6), "lease_expires_at" => (now + 900).getutc.iso8601(6), "state" => "claimed" }
      C.immutable_copy({ "run" => run, "prior_transition" => transition })
    end
  end
end
