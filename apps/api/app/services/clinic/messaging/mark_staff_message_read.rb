module Clinic
  module Messaging
    class MarkStaffMessageRead
      def self.call(practice:, actor:, conversation:)
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.read", site_id: conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: member.id)
        now = Current.business_time
        conversation.messages.where.not(sender_membership_id: member.id).find_each do |message|
          message.receipts.where(recipient_membership_id: member.id, read_at: nil).update_all(read_at: now, presented_at: now)
        end
        latest = conversation.messages.order(created_at: :desc, id: :desc).first
        conversation.members.where(membership_id: member.id).update_all(last_read_message_id: latest&.id, last_read_at: now)
        Clinic::AuditRecorder.record!(practice: practice, actor: actor,
          action_code: "staff_messaging.message.read", outcome: :released)
        true
      end
    end
  end
end
