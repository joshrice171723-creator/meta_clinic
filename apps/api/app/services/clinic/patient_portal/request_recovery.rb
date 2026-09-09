module Clinic
  module PatientPortal
    class RequestRecovery
      MESSAGE = "If a matching portal account with a mobile number exists, a secure recovery link will be sent by text message."

      def self.call(contact:, preview:, now: Current.business_time)
        identity = Identity.includes(patient: :contacts).joins(:user)
          .find_by(users: { email_address: contact.to_s.strip.downcase })
        return generic_result unless eligible?(identity)

        phone_contact = current_phone_contact(identity.patient, at: now)
        return generic_result unless phone_contact
        return generic_result unless RecoverySmsConfig.configured? || preview

        invitation = nil
        ApplicationRecord.transaction do
          identity.recovery_deliveries.pending.update_all(
            status: "cancelled", completed_at: now, token: nil, updated_at: now
          )
          invitation = InviteIdentity.call(
            practice: identity.practice,
            patient: identity.patient,
            actor: identity.user,
            email_address: identity.user.email_address,
            now: now
          )
          if RecoverySmsConfig.configured?
            invited_identity = invitation.fetch(:identity)
            invited_identity.recovery_deliveries.create!(
              practice: identity.practice,
              patient_contact: phone_contact,
              token: invitation.fetch(:token),
              requested_at: now,
              available_at: now,
              expires_at: invited_identity.invitation_expires_at
            )
          end
        end

        {
          accepted: true,
          message: MESSAGE,
          recovery_path: preview ? local_path(invitation.fetch(:token)) : nil
        }
      rescue ArgumentError, ActiveRecord::RecordInvalid
        generic_result
      end

      def self.eligible?(identity)
        identity&.active? && identity.user.active? &&
          Clinic::DeploymentAccess.practice_enabled?(identity.practice_id)
      end
      private_class_method :eligible?

      def self.current_phone_contact(patient, at:)
        patient.contacts.select do |contact|
          contact.contact_type_phone? && contact.effective_from <= at &&
            (contact.effective_until.nil? || contact.effective_until > at)
        end.sort_by { |contact| [ contact.preferred? ? 1 : 0, contact.effective_from, contact.id ] }.last
      end
      private_class_method :current_phone_contact

      def self.local_path(token)
        "/patient-portal/activate#token=#{ERB::Util.url_encode(token)}&purpose=recovery"
      end
      private_class_method :local_path

      def self.generic_result
        { accepted: true, message: MESSAGE, recovery_path: nil }
      end
      private_class_method :generic_result
    end
  end
end
