require "securerandom"

module Clinic
  module PatientPortal
    class InviteIdentity
      def self.call(practice:, patient:, user:, actor:, now: Time.current)
        raise ArgumentError, "The patient account is inactive." unless user.active?

        token = SecureRandom.urlsafe_base64(32)
        ApplicationRecord.transaction do
          identity = Identity.lock.find_or_initialize_by(user: user)
          raise ArgumentError, "That patient already has active portal access." if identity.persisted? && identity.active?
          if identity.persisted? && identity.patient_id != patient.id
            raise ArgumentError, "That account is already assigned to another patient."
          end

          identity.assign_attributes(practice: practice, patient: patient, status: :invited,
            invited_at: now, activated_at: nil, revoked_at: nil, revoked_reason: nil,
            accepted_terms_version: nil, accepted_terms_at: nil, last_step_up_at: nil,
            invitation_digest: Identity.digest_token(token),
            invitation_expires_at: now + Identity::INVITATION_TTL)
          identity.save!
          AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "patient_portal.identity.invite", outcome: :committed,
            resource_version_ref: "patient_portal_identity:#{identity.id}")
          identity
        end
        { identity: Identity.find_by!(user: user), token: token }
      end
    end
  end
end
