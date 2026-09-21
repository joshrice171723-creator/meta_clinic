module Platform
  class ResetOwnerPassword
    class InvalidReset < StandardError; end
    class InvalidPassword < StandardError; end

    def self.call(token:, password:, password_confirmation:, now: Time.current)
      result = nil
      expired = false
      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended('platform-owner-password-reset', 0))"
        )
        reset = OwnerPasswordReset.pending.lock.find_by(
          token_digest: OwnerPasswordReset.digest(token)
        )
        raise InvalidReset unless reset

        if reset.expires_at <= now
          reset.update!(revoked_at: now, token_digest: nil)
          expired = true
          next
        end

        owner = reset.user.lock!
        raise InvalidReset unless owner.platform_owner? && owner.active?

        owner.update!(password:, password_confirmation:)
        reset.update!(used_at: now, token_digest: nil)
        PlatformAuditEvent.create!(
          actor_session_reference: "user:#{owner.id}",
          action_code: "owner.password_reset.complete",
          outcome: "committed",
          occurred_at: now
        )
        result = { user: owner }
      end
      raise InvalidReset if expired

      result
    rescue ActiveRecord::RecordInvalid => error
      if error.record.is_a?(User) &&
          error.record.errors.attribute_names.all? { |attribute| %i[password password_confirmation].include?(attribute) }
        raise InvalidPassword, error.record.errors.full_messages.to_sentence
      end
      raise InvalidReset
    end
  end
end
