module Clinic
  module PatientPortal
    class ActivateIdentity
      class InvalidInvitation < StandardError; end
      class InvalidPassword < StandardError; end

      def self.call(token:, password:, password_confirmation:, accepted_terms:, terms_version:, session:,
        now: Current.business_time)
        raise InvalidInvitation unless accepted_terms && terms_version == Identity::TERMS_VERSION

        identity = nil
        ApplicationRecord.transaction do
          identity = Identity.where(status: :invited, invitation_digest: Identity.digest_token(token)).lock.first
          raise InvalidInvitation unless identity&.invitation_expires_at && identity.invitation_expires_at > now
          raise InvalidInvitation unless Clinic::DeploymentAccess.practice_enabled?(identity.practice_id)

          identity.user.lock!
          identity.user.update!(password: password, password_confirmation: password_confirmation, active: true)
          identity.update!(status: :active, activated_at: now,
            accepted_terms_version: terms_version, accepted_terms_at: now,
            invitation_digest: nil, invitation_expires_at: nil)
          identity.user.member_sessions.delete_all
          member_session = identity.user.member_sessions.create!(expires_at: now + MemberSession::MAX_DURATION)
          session[:member_session_id] = member_session.id
          session[:patient_portal_identity_id] = identity.id
          Clinic::AuditRecorder.record!(practice: identity.practice, actor: identity.user,
            action_code: "patient_portal.identity.activate", outcome: :committed,
            resource_version_ref: "patient_portal_identity:#{identity.id}")
        end
        identity
      rescue ActiveRecord::RecordInvalid => error
        if error.record.is_a?(User) &&
            error.record.errors.attribute_names.all? { |attribute| %i[password password_confirmation].include?(attribute) }
          raise InvalidPassword, error.record.errors.full_messages.to_sentence
        end

        raise InvalidInvitation
      end
    end
  end
end
