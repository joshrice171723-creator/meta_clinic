module Platform
  class ActivateOwner
    class InvalidInvitation < StandardError; end
    class InvalidPassword < StandardError; end

    def self.call(token:, password:, password_confirmation:, now: Time.current)
      result = nil
      expired = false
      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended('platform-owner-invitation', 0))"
        )
        invitation = Platform::OwnerInvitation.pending.lock.find_by(
          token_digest: Platform::OwnerInvitation.digest(token)
        )
        raise InvalidInvitation unless invitation

        if invitation.expires_at <= now
          invitation.update!(status: :revoked, token_digest: nil, revoked_at: now)
          expired = true
          next
        end
        raise InvalidInvitation if User.where(platform_owner: true).exists?

        user = User.create!(
          email_address: invitation.email_address,
          password: password,
          password_confirmation: password_confirmation,
          active: true,
          admin: true,
          platform_owner: true
        )
        invitation.update!(status: :accepted, token_digest: nil, accepted_at: now)
        PlatformAuditEvent.create!(
          actor_session_reference: "user:#{user.id}",
          action_code: "owner.invitation.accept",
          outcome: "committed",
          occurred_at: now
        )
        result = { user:, invitation: }
      end
      raise InvalidInvitation if expired

      result
    rescue ActiveRecord::RecordNotUnique
      raise InvalidInvitation
    rescue ActiveRecord::RecordInvalid => error
      if error.record.is_a?(User) &&
          error.record.errors.attribute_names.all? { |attribute| %i[password password_confirmation].include?(attribute) }
        raise InvalidPassword, error.record.errors.full_messages.to_sentence
      end
      raise InvalidInvitation
    end
  end
end
