module Clinic
  class AuditRecorder
    class Unavailable < StandardError
      def initialize
        super("Required clinic audit evidence is unavailable.")
      end
    end

    POLICY_VERSION = "clinic-authorization-v1"

    def self.record(practice:, actor:, action_code:, outcome:, resource_version_ref: nil)
      record!(practice: practice, actor: actor, action_code: action_code, outcome: outcome,
        resource_version_ref: resource_version_ref)
    end

    def self.record!(practice:, actor:, action_code:, outcome:, resource_version_ref: nil)
      raise Unavailable unless practice.respond_to?(:id) && actor.respond_to?(:id)

      ApplicationRecord.transaction do
        event = practice.audit_events.create!(
          actor_session_reference: actor_session_reference(actor),
          action_code: action_code.to_s,
          outcome: outcome.to_s,
          policy_version: POLICY_VERSION,
          occurred_at: Time.current
        )
        if resource_version_ref.present?
          event.resource_manifests.create!(
            practice: practice,
            protected_resource_version_ref: resource_version_ref.to_s
          )
        end
        event
      end
    rescue ActiveRecord::RecordInvalid, ActiveRecord::StatementInvalid
      raise Unavailable
    end

    def self.record_platform(actor:, action_code:, outcome:, session_reference: nil, occurred_at: Time.current)
      return unless actor

      PlatformAuditEvent.create!(
        actor_session_reference: session_reference || actor_session_reference(actor),
        action_code: action_code.to_s,
        outcome: outcome.to_s,
        occurred_at: occurred_at
      )
    rescue ActiveRecord::RecordInvalid, ActiveRecord::StatementInvalid
      Rails.logger.warn("Platform audit recording failed for #{action_code}")
      nil
    end

    def self.actor_session_reference(actor)
      if actor.respond_to?(:id)
        "user:#{actor.id}"
      else
        actor.to_s
      end
    end
    private_class_method :actor_session_reference
  end
end
