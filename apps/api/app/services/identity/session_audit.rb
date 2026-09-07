module Identity
  class SessionAudit
    class Unavailable < StandardError; end

    def self.record!(action:, user_id: nil, outcome: "committed")
      PlatformAuditEvent.create!(
        actor_session_reference: user_id ? "user:#{user_id}" : "anonymous",
        action_code: "identity.#{action}", outcome: outcome, occurred_at: Time.current
      )
    rescue ActiveRecord::ActiveRecordError
      raise Unavailable, "Session security recording is unavailable."
    end
  end
end
