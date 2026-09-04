module Clinic
  module PatientPortal
    class RevokeIdentity
      def self.call(identity:, actor:, reason:, now: Time.current)
        ApplicationRecord.transaction do
          identity.with_lock do
            identity.update!(status: :revoked, revoked_at: now, revoked_reason: reason,
              invitation_digest: nil, invitation_expires_at: nil)
            identity.user.member_sessions.delete_all
            Clinic::AuditRecorder.record!(practice: identity.practice, actor: actor,
              action_code: "patient_portal.identity.revoke", outcome: :committed,
              resource_version_ref: "patient_portal_identity:#{identity.id}")
          end
        end
        identity
      end
    end
  end
end
