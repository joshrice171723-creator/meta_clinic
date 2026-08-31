module Clinic
  module Messaging
    class CreateIntent
      def self.call(practice:, actor:, patient:, request_key:, purpose_code:, encrypted_recipient_snapshot:, encrypted_content:, document_ids: [])
        Authorization.authorize!(actor: actor, practice: practice, action: "messages.write")
        patient = practice.patients.find(patient.id)

        ApplicationRecord.transaction do
          existing = MessageIntent.find_by(practice: practice, request_key: request_key)
          if existing
            return existing if compatible?(existing, patient: patient, purpose_code: purpose_code, encrypted_recipient_snapshot: encrypted_recipient_snapshot,
              encrypted_content: encrypted_content, document_ids: document_ids)

            raise ArgumentError, "This message request key was already used for different data."
          end

          intent = MessageIntent.create!(
            practice: practice,
            patient: patient,
            request_key: request_key,
            purpose_code: purpose_code,
            encrypted_recipient_snapshot: encrypted_recipient_snapshot,
            encrypted_content: encrypted_content
          )
          document_ids.each do |document_id|
            document = practice.documents.find(document_id)
            intent.attachments.create!(practice: practice, patient: patient, document: document)
          end
          intent.create_outbox!(practice: practice, dispatch_state: "pending")
          intent
        end
      rescue ActiveRecord::RecordNotUnique
        retry_existing = MessageIntent.find_by!(practice: practice, request_key: request_key)
        unless compatible?(retry_existing, patient: patient, purpose_code: purpose_code, encrypted_recipient_snapshot: encrypted_recipient_snapshot,
          encrypted_content: encrypted_content, document_ids: document_ids)
          raise ArgumentError, "This message request key was already used for different data."
        end

        retry_existing
      end

      def self.compatible?(intent, patient:, purpose_code:, encrypted_recipient_snapshot:, encrypted_content:, document_ids:)
        intent.patient_id == patient.id && intent.purpose_code == purpose_code.to_s &&
          intent.encrypted_recipient_snapshot == encrypted_recipient_snapshot && intent.encrypted_content == encrypted_content &&
          intent.attachments.pluck(:document_id).sort == document_ids.map(&:to_i).sort
      end
      private_class_method :compatible?
    end
  end
end
