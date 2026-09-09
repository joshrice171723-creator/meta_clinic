module Clinic
  module Messaging
    class MarkStaffMessageRead
      def self.call(practice:, actor:, conversation:)
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.read", site_id: conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: member.id)
        now = Current.business_time
        ApplicationRecord.transaction do
          locked_conversation = Clinic::StaffConversation.where(practice_id: practice.id).lock.find(conversation.id)
          conversation_member = locked_conversation.members.active.lock.find_by!(membership_id: member.id)
          message_ids = locked_conversation.messages.where.not(sender_membership_id: member.id).select(:id)
          Clinic::StaffMessageReceipt.where(
            practice_id: practice.id,
            recipient_membership_id: member.id,
            message_id: message_ids,
            read_at: nil
          ).update_all(read_at: now, presented_at: now)
          latest = locked_conversation.messages.order(created_at: :desc, id: :desc).first
          conversation_member.update!(last_read_message: latest, last_read_at: now)
          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "staff_messaging.message.read", outcome: :released)
        end
        true
      end
    end
  end
end
