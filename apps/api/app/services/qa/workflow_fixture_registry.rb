module Qa
  # Read-only abstraction. No public API creates verification/revocation receipts.
  # Registration is a separately reviewed server operation, not a name prefix,
  # request boolean, ordinary Office message, or existing demo seed invocation.
  class WorkflowFixtureRegistry
    KIND = "workflow_fixture_verified".freeze
    REVOKED = "workflow_fixture_revoked".freeze

    def self.resolve!(workflow:, principal:, user:)
      receipt = Event.where(kind: KIND).where("payload -> 'workflow_ids' ? :workflow", workflow: workflow.fetch("id"))
        .where("payload -> 'principal_keys' ? :principal", principal: principal.fetch(:key)).order(id: :desc).first
      raise OfficeActorPolicy::Denied, "Synthetic fixture registry is unconfigured for this principal and workflow." unless receipt
      verify!(receipt:, workflow:, principal:, user:)
    end

    def self.verify!(receipt:, workflow:, principal:, user:)
      raise OfficeActorPolicy::Denied, "A server-authored fixture verification receipt is required." unless receipt.kind == KIND && receipt.user.active? && receipt.user.platform_owner?
      data = validate_scope!(data: receipt.payload, workflow:, principal:)
      if Event.where(kind: REVOKED).where("payload ->> 'fixture_receipt_id' = ?", receipt.id.to_s).exists?
        raise OfficeActorPolicy::Denied, "Synthetic fixture verification was revoked."
      end
      # Preserve tenant existence without blocking audit rows' FK key-share locks.
      practice = Clinic::Practice.lock("FOR NO KEY UPDATE").find(data["practice_id"])
      unless Clinic::Membership.active.lock.find_by(practice_id: practice.id, user_id: user.id)
        raise OfficeActorPolicy::Denied, "The bound principal has no membership in the verified synthetic tenant."
      end
      { "practice_id" => practice.id, "fixture_receipt_id" => receipt.id }
    end
    # Shape/scope check only; verify! supplies the authoritative receipt,
    # owner, revocation, practice and membership checks.
    def self.validate_scope!(data:, workflow:, principal:)
      c = WorkflowContract
      data = c.object!(data, %w[schema_version practice_id workflow_ids principal_keys fixture_keys verification_ref])
      raise ArgumentError, "Unsupported fixture registry schema." unless data["schema_version"] == 1
      c.positive!(data["practice_id"])
      c.strings!(data["workflow_ids"], minimum: 1).each { |id| c.workflow!(id) }
      c.strings!(data["principal_keys"], minimum: 1, maximum: 20)
      c.strings!(data["fixture_keys"], maximum: 50)
      c.text!(data["verification_ref"])
      unless data["workflow_ids"].include?(workflow.fetch("id")) && data["principal_keys"].include?(principal.fetch(:key)) &&
          (workflow.fetch("fixtures") - data["fixture_keys"]).empty?
        raise OfficeActorPolicy::Denied, "Verified fixture scope does not cover this workflow and principal."
      end
      data
    end
  end
end
