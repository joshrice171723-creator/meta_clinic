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
          patient.lock!
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
        bound_identity = Identity.lock.find_by(practice_id: practice.id, patient_id: patient.id)
        if bound_identity
          bound_user = User.lock.find(bound_identity.user_id)
          if user && user.id != bound_user.id
            raise ArgumentError, "That patient is already assigned to another account."
          end
          update_bound_email!(bound_user, email_address) if email_address
          return bound_user
        end

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

      def self.update_bound_email!(user, email_address)
        normalized_email = email_address.to_s.strip.downcase
        owner = User.find_by(email_address: normalized_email)
        if owner && owner.id != user.id
          raise ArgumentError, "That email already belongs to another account."
        end
        user.update!(email_address: normalized_email) unless user.email_address == normalized_email
      end
      private_class_method :resolve_user!, :update_bound_email!
    end
  end
end
