require "digest"

module Clinic
  module PatientPortal
    class DispatchRecoverySms
      LEASE_DURATION = 30.seconds

      def self.call(delivery_id:, at: Current.business_time, provider: RecoverySmsProvider)
        claim = claim(delivery_id: delivery_id, at: at)
        return claim unless claim.is_a?(Hash)

        result = provider.deliver(to: claim.fetch(:destination), body: claim.fetch(:body))
        finalize(delivery_id: delivery_id, lease_token: claim.fetch(:lease_token), result: result,
          at: Current.business_time)
      end

      def self.claim(delivery_id:, at:)
        ApplicationRecord.transaction do
          delivery = RecoveryDelivery.lock.find(delivery_id)
          if delivery.leased?
            return delivery unless delivery.lease_until <= at

            delivery.update!(status: :unknown, token: nil, lease_until: nil, lease_token_digest: nil,
              failure_code: "worker_interrupted", completed_at: at)
            return delivery
          end
          return delivery unless delivery.pending?
          if delivery.expires_at <= at
            delivery.update!(status: :expired, token: nil, completed_at: at)
            return delivery
          end

          token = delivery.token
          unless valid_current_request?(delivery, token: token, at: at)
            delivery.update!(status: :cancelled, token: nil, failure_code: "recovery_request_superseded",
              completed_at: at)
            return delivery
          end
          unless RecoverySmsConfig.configured?
            delivery.update!(status: :gated, token: nil, failure_code: "provider_unconfigured", completed_at: at)
            return delivery
          end

          destination = RecoverySmsConfig.normalize_phone(delivery.patient_contact.contact_value)
          unless destination
            delivery.update!(status: :failed, token: nil, failure_code: "destination_invalid", completed_at: at)
            return delivery
          end

          lease_token = SecureRandom.urlsafe_base64(32)
          delivery.update!(status: :leased, lease_until: at + LEASE_DURATION,
            lease_token_digest: Digest::SHA256.hexdigest(lease_token), attempt_count: 1)
          {
            lease_token: lease_token,
            destination: destination,
            body: "APPly password reset: #{RecoverySmsConfig.reset_url(token)} This link expires in 30 minutes. If you did not request it, ignore this message."
          }
        end
      end
      private_class_method :claim

      def self.valid_current_request?(delivery, token:, at:)
        identity = delivery.identity
        contact = delivery.patient_contact
        return false unless identity.active? && identity.user.active? &&
          identity.invitation_expires_at && identity.invitation_expires_at > at
        return false unless Clinic::DeploymentAccess.practice_enabled?(identity.practice_id)
        return false unless identity.invitation_digest.present? && ActiveSupport::SecurityUtils.secure_compare(
          identity.invitation_digest, Identity.digest_token(token)
        )

        current_contact = Clinic::Care::CurrentPatientContact.call(patient: identity.patient, contact_type: "phone", at: at)
        current_contact&.id == contact.id &&
          contact.practice_id == identity.practice_id && contact.patient_id == identity.patient_id &&
          contact.contact_type_phone? && contact.effective_from <= at &&
          (contact.effective_until.nil? || contact.effective_until > at)
      end
      private_class_method :valid_current_request?

      def self.finalize(delivery_id:, lease_token:, result:, at:)
        ApplicationRecord.transaction do
          delivery = RecoveryDelivery.lock.find(delivery_id)
          expected = Digest::SHA256.hexdigest(lease_token)
          return delivery unless delivery.leased? && delivery.lease_token_digest.present? &&
            ActiveSupport::SecurityUtils.secure_compare(delivery.lease_token_digest, expected)

          status = result.fetch(:status).to_s
          raise ArgumentError, "Unsupported recovery delivery result." unless %w[accepted failed unknown gated].include?(status)
          delivery.update!(
            status: status,
            token: nil,
            provider_message_id: result[:provider_message_id],
            failure_code: result[:failure_code],
            accepted_at: status == "accepted" ? at : nil,
            completed_at: at,
            lease_until: nil,
            lease_token_digest: nil
          )
          delivery
        end
      end
      private_class_method :finalize
    end
  end
end
