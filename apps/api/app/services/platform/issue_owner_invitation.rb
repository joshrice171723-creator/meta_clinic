module Platform
  class IssueOwnerInvitation
    class Unavailable < StandardError; end
    class DeliveryFailed < StandardError; end

    def self.call(email_address:, now: Time.current)
      email = email_address.to_s.strip.downcase
      token = SecureRandom.urlsafe_base64(48)
      invitation = nil

      ApplicationRecord.transaction do
        ApplicationRecord.connection.execute(
          "SELECT pg_advisory_xact_lock(hashtextextended('platform-owner-invitation', 0))"
        )
        raise Unavailable, "A platform owner already exists." if User.where(platform_owner: true).exists?

        Platform::OwnerInvitation.pending.lock.find_each do |existing|
          existing.update!(status: :revoked, token_digest: nil, revoked_at: now)
        end

        invitation = Platform::OwnerInvitation.create!(
          email_address: email,
          token_digest: Platform::OwnerInvitation.digest(token),
          status: :pending,
          invited_at: now,
          expires_at: now + Platform::OwnerInvitation::INVITATION_TTL
        )
        PlatformAuditEvent.create!(
          actor_session_reference: "system:platform-owner-bootstrap",
          action_code: "owner.invitation.issue",
          outcome: "committed",
          occurred_at: now
        )
      end

      Platform::OwnerInvitationMailer.invitation(invitation.id, token).deliver_now
      invitation
    rescue ActiveRecord::RecordInvalid => error
      raise Unavailable, error.record.errors.full_messages.to_sentence
    rescue StandardError => error
      raise if error.is_a?(Unavailable)

      revoke_after_delivery_failure(invitation, now:)
      Rails.logger.error("Platform owner invitation delivery failed: #{error.class}")
      raise DeliveryFailed, "The platform owner invitation email could not be delivered."
    end

    def self.revoke_after_delivery_failure(invitation, now:)
      return unless invitation&.persisted?

      invitation.with_lock do
        invitation.update!(status: :revoked, token_digest: nil, revoked_at: now) if invitation.pending?
      end
      PlatformAuditEvent.create!(
        actor_session_reference: "system:platform-owner-bootstrap",
        action_code: "owner.invitation.deliver",
        outcome: "failed",
        occurred_at: now
      )
    rescue ActiveRecord::ActiveRecordError => error
      Rails.logger.error("Platform owner invitation recovery failed: #{error.class}")
    end
    private_class_method :revoke_after_delivery_failure
  end
end
