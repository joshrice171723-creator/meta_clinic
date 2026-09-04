require "digest"

module Clinic
  module Messaging
    class PresignStaffAttachment
      CONTENT_TYPES = %w[application/pdf image/png image/jpeg text/plain].freeze
      MAX_BYTES = 10.megabytes

      def self.call(practice:, actor:, message:, request_key:, filename:, content_type:, byte_size:, checksum:)
        conversation = message.conversation
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.attach", site_id: conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: member.id)
        raise ArgumentError, "The attachment type is unsupported." unless CONTENT_TYPES.include?(content_type.to_s.downcase)
        raise ArgumentError, "The attachment is too large." unless byte_size.to_i.between?(1, MAX_BYTES)
        raise ArgumentError, "A checksum is required." if checksum.to_s.strip.blank?
        raise ArgumentError, "The attachment filename is invalid." if filename.to_s.strip.blank? || filename.to_s.length > 180

        payload = { message_id: message.id, filename: filename.to_s, content_type: content_type.to_s, byte_size: byte_size.to_i, checksum: checksum.to_s }
        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "staff_messaging.attachment.presign",
          request_key: request_key, payload: payload,
          authorization: -> { StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.attach", site_id: conversation.site_id) },
          authorization_action: "staff_messaging.attach",
          result_resource: ->(attachment) { attachment },
          resource_resolver: ->(practice:, receipt:) { Clinic::StaffMessageAttachment.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          attachment = Clinic::StaffMessageAttachment.create!(
            practice: practice, message: message,
            created_by_membership: member, storage_key: "staff-messaging/#{practice.id}/#{SecureRandom.uuid}",
            content_type: content_type.to_s, byte_size: byte_size.to_i, checksum: checksum.to_s, scan_state: "quarantined"
          )
          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "staff_messaging.attachment.presign", outcome: :committed,
            resource_version_ref: "staff_message_attachment:#{attachment.id}")
          attachment
        end
        outcome.value
      end
    end
  end
end
