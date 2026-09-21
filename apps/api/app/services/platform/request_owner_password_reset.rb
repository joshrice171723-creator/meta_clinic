module Platform
  class RequestOwnerPasswordReset
    MESSAGE = "If an active platform-owner account matches that email, a secure password reset link will be sent."

    def self.call(email_address:, now: Time.current)
      email = email_address.to_s.strip.downcase
      owner = User.find_by(email_address: email, platform_owner: true, active: true)
      return generic_result unless owner

      token = SecureRandom.urlsafe_base64(48)
      reset = nil
      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended('platform-owner-password-reset', 0))"
        )
        owner.lock!
        return generic_result unless owner.platform_owner? && owner.active?

        OwnerPasswordReset.pending.where(user: owner).update_all(
          revoked_at: now, token_digest: nil, updated_at: now
        )
        reset = OwnerPasswordReset.create!(
          user: owner,
          token_digest: OwnerPasswordReset.digest(token),
          requested_at: now,
          expires_at: now + OwnerPasswordReset::RESET_TTL
        )
        PlatformAuditEvent.create!(
          actor_session_reference: "system:platform-owner-password-reset",
          action_code: "owner.password_reset.request",
          outcome: "committed",
          occurred_at: now
        )
      end

      OwnerPasswordResetMailer.reset(reset.id, token).deliver_now
      generic_result
    rescue StandardError
      revoke_delivery_failure(reset, now:)
      generic_result
    end

    def self.generic_result
      { requested: true, message: MESSAGE }
    end
    private_class_method :generic_result

    def self.revoke_delivery_failure(reset, now:)
      return unless reset&.persisted?

      reset.with_lock do
        reset.update!(revoked_at: now, token_digest: nil) if reset.pending?
      end
      PlatformAuditEvent.create!(
        actor_session_reference: "system:platform-owner-password-reset",
        action_code: "owner.password_reset.delivery",
        outcome: "failed",
        occurred_at: now
      )
    rescue ActiveRecord::ActiveRecordError
      nil
    end
    private_class_method :revoke_delivery_failure
  end
end
