module Clinic
  module PatientPortal
    class CreateRequest
      def self.call(practice:, patient:, identity:, request_key:, request_type:, content:)
        content = content.to_s.strip
        digest = Digest::SHA256.hexdigest(content)

        ApplicationRecord.transaction do
          existing = Request.find_by(practice: practice, request_key: request_key)
          if existing
            return existing if existing.patient_id == patient.id && existing.identity_id == identity.id &&
              existing.request_type == request_type.to_s && existing.content_digest == digest

            raise ArgumentError, "This request key was already used for different data."
          end

          Request.create!(practice: practice, patient: patient, identity: identity,
            request_key: request_key, request_type: request_type, content: content,
            content_digest: digest, requested_at: Current.business_time, status: :pending)
        end
      rescue ActiveRecord::RecordNotUnique
        retry_existing = Request.find_by!(practice: practice, request_key: request_key)
        return retry_existing if retry_existing.patient_id == patient.id && retry_existing.identity_id == identity.id &&
          retry_existing.request_type == request_type.to_s && retry_existing.content_digest == digest

        raise ArgumentError, "This request key was already used for different data."
      end
    end
  end
end
