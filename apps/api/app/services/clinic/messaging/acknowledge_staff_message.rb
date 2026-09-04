module Clinic
  module Messaging
    class AcknowledgeStaffMessage
      def self.call(practice:, actor:, message:, note: nil)
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.acknowledge", site_id: message.conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: message.conversation, membership_id: member.id)
        receipt = message.receipts.find_by(recipient_membership_id: member.id)
        raise ActiveRecord::RecordNotFound unless receipt
        raise ArgumentError, "This message does not require acknowledgement." unless message.acknowledgement_required?

        now = Time.current
        ApplicationRecord.transaction do
          receipt.update!(acknowledged_at: now, acknowledgement_note: note.to_s.strip.presence)
          message.update!(acknowledged_at: now, acknowledged_by_membership: member) if message.acknowledged_at.blank?
          request = message.request
          request.transition_to!("acknowledged") if request && %w[open].include?(request.state)
          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "staff_messaging.message.acknowledge", outcome: :committed,
            resource_version_ref: "staff_message:#{message.id}")
        end
        message
      end
    end
  end
end
