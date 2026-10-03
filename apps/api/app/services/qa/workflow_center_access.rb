module Qa
  # Deliberately dormant: existing Office bindings are necessary, not sufficient,
  # for new workflow actions. No environment flag or request can enable this.
  class WorkflowCenterAccess
    ACTIONS = %w[record_evidence claim_workflow].freeze

    def self.authorize!(user:, token:, action:)
      raise ArgumentError, "Unknown workflow action." unless ACTIONS.include?(action)
      OfficeWork.identity(user, token)
      raise OfficeActorPolicy::Denied, "Workflow #{action} is not activated; an explicitly approved per-action server policy and synthetic registry are required."
    end
  end
end
