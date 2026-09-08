module Clinic
  module StaffMessagingSerializer
    module_function

    def participant(membership)
      { id: membership.id, email: membership.user.email_address, active: membership.active? }
    end

    def conversation(conversation, actor_membership_id: nil)
      active_members = conversation.members.active.includes(membership: :user)
      unread = actor_membership_id && conversation.messages.joins(:receipts).where(
        clinic_staff_message_receipts: { recipient_membership_id: actor_membership_id, read_at: nil }
      ).exists?
      latest = conversation.messages.order(created_at: :desc, id: :desc).first
      {
        id: conversation.id, kind: conversation.kind, title: conversation.title,
        status: conversation.status, site_id: conversation.site_id,
        last_message_at: conversation.last_message_at,
        unread: !!unread, urgent: conversation.messages.where(message_class: %w[urgent safety_critical], status: "active").exists?,
        unresolved: conversation.messages.joins(:request).where.not(clinic_staff_message_requests: { state: %w[resolved declined expired] }).exists?,
        participants: active_members.map { |member| participant(member.membership) },
        last_message_class: latest&.message_class
      }
    end

    def message(message, include_body: true)
      request = message.request
      {
        id: message.id, sender_membership_id: message.sender_membership_id,
        sender_email: message.sender_membership.user.email_address,
        body: include_body ? message.body : nil, message_class: message.message_class,
        status: message.status, created_at: message.created_at, response_due_at: message.response_due_at,
        acknowledgement_required: message.acknowledgement_required?, acknowledged_at: message.acknowledged_at,
        acknowledged_by_membership_id: message.acknowledged_by_membership_id,
        requested_action: message.requested_action,
        linked_object: message.linked_object_type && { type: message.linked_object_type, id: message.linked_object_id },
        request: request && { id: request.id, state: request.state, assignee_membership_id: request.assignee_membership_id,
          due_at: request.due_at, resolved_at: request.resolved_at, resolution_code: request.resolution_code },
        attachments: message.attachments.order(:id).map { |attachment|
          { id: attachment.id, content_type: attachment.content_type, byte_size: attachment.byte_size, scan_state: attachment.scan_state }
        }
      }
    end

    def notification(notification)
      { id: notification.id, category: notification.category, title: notification.title,
        conversation_id: notification.conversation_id, message_id: notification.message_id,
        read_at: notification.read_at, created_at: notification.created_at }
    end
  end
end
