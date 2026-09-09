require "securerandom"

module Clinic
  module PatientPortal
    class InviteIdentity
      def self.call(practice:, patient:, actor:, user: nil, email_address: nil, now: Current.business_time)
        unless patient.practice_id == practice.id
          patient.errors.add(:practice, "does not match the invitation clinic")
          raise ActiveRecord::RecordInvalid, patient
        end
        token = SecureRandom.urlsafe_base64(32)
        identity = nil
        ApplicationRecord.transaction do
          user = resolve_user!(practice:, patient:, user:, email_address:)
          identity = Identity.lock.find_or_initialize_by(user: user)
          if identity.persisted? && (identity.practice_id != practice.id || identity.patient_id != patient.id)
            raise ArgumentError, "That account is already assigned to another patient."
          end

          recovering = identity.persisted? && identity.active?
          identity.assign_attributes(practice: practice, patient: patient,
            invitation_digest: Identity.digest_token(token), invitation_expires_at: now + Identity::INVITATION_TTL,
            invited_at: now)
          unless recovering
            identity.assign_attributes(status: :invited, activated_at: nil, revoked_at: nil, revoked_reason: nil,
              accepted_terms_version: nil, accepted_terms_at: nil, last_step_up_at: nil)
          end
          identity.save!
          AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "patient_portal.identity.invite", outcome: :committed,
            resource_version_ref: "patient_portal_identity:#{identity.id}")
          identity
        end
        { identity: identity, token: token, purpose: identity.active? ? "recovery" : "activation" }
      rescue ActiveRecord::RecordNotUnique
        raise ArgumentError, "That email already belongs to another account."
      end

      def self.resolve_user!(practice:, patient:, user:, email_address:)
        if user
          locked = User.lock.find(user.id)
          raise ArgumentError, "The patient account is inactive." unless locked.active?
          return locked
        end

        normalized_email = email_address.to_s.strip.downcase
        candidate = User.lock.find_by(email_address: normalized_email)
        unless candidate
          return User.create!(email_address: normalized_email, password: SecureRandom.urlsafe_base64(48), active: false)
        end

        identity = Identity.lock.find_by(user: candidate)
        unless identity && identity.practice_id == practice.id && identity.patient_id == patient.id
          raise ArgumentError, "That email already belongs to another account."
        end
        candidate
      end
      private_class_method :resolve_user!
    end
  end
end
