module Clinic
  module PatientPortal
    class ActivateIdentity
      class InvalidInvitation < StandardError; end

      def self.call(token:, accepted_terms:, terms_version:, session:, now: Time.current)
        raise InvalidInvitation unless accepted_terms && terms_version == Identity::TERMS_VERSION

        identity = nil
        ApplicationRecord.transaction do
          identity = Identity.where(status: :invited, invitation_digest: Identity.digest_token(token)).lock.first
          raise InvalidInvitation unless identity&.invitation_expires_at&.future?

          identity.update!(status: :active, activated_at: now,
            accepted_terms_version: terms_version, accepted_terms_at: now,
            invitation_digest: nil, invitation_expires_at: nil)
          identity.user.member_sessions.delete_all
          member_session = identity.user.member_sessions.create!(expires_at: MemberSession::MAX_DURATION.from_now)
          session[:member_session_id] = member_session.id
          session[:patient_portal_identity_id] = identity.id
          Clinic::AuditRecorder.record!(practice: identity.practice, actor: identity.user,
            action_code: "patient_portal.identity.activate", outcome: :committed,
            resource_version_ref: "patient_portal_identity:#{identity.id}")
        end
        identity
      end
    end
  end
end
