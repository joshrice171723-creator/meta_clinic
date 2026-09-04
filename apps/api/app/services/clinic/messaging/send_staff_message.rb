module Clinic
  module Messaging
    class SendStaffMessage
      def self.call(practice:, actor:, conversation:, request_key:, body:, message_class: "routine", response_due_at: nil,
        assignee_membership_id: nil, requested_action: nil, reply_to_message_id: nil, linked_object_type: nil, linked_object_id: nil)
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.send", site_id: conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: member.id)
        message_class = message_class.to_s
        raise ArgumentError, "The message class is unsupported." unless StaffMessage::CLASSES.include?(message_class)
        body = body.to_s.strip
        raise ArgumentError, "Message body is required." if body.blank? || body.length > 10_000

        due_at = response_due_at.present? ? response_due_at.to_time : nil
        if message_class != "routine"
          raise ArgumentError, "A response target is required for this message class." unless due_at && due_at > Time.current && due_at <= 30.days.from_now
          raise ArgumentError, "An accountable staff member is required for this message class." unless assignee_membership_id.present?
        end
        assignee = assignee_membership_id.present? ? StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: assignee_membership_id) : nil
        linked = StaffPolicy.linked_object!(practice: practice, actor: actor, type: linked_object_type, id: linked_object_id)
        raise ArgumentError, "A reply must belong to this conversation." if reply_to_message_id.present? && !conversation.messages.exists?(id: reply_to_message_id)

        payload = { conversation_id: conversation.id, body: body, message_class: message_class, response_due_at: due_at,
          assignee_membership_id: assignee&.membership_id, requested_action: requested_action, reply_to_message_id: reply_to_message_id,
          linked_object_type: linked&.class&.name&.demodulize&.underscore, linked_object_id: linked&.id }
        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "staff_messaging.message.send",
          request_key: request_key, payload: payload,
          authorization: -> { StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.send", site_id: conversation.site_id) },
          authorization_action: "staff_messaging.send",
          result_resource: ->(message) { message },
          resource_resolver: ->(practice:, receipt:) { Clinic::StaffMessage.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          ApplicationRecord.transaction do
            message = conversation.messages.create!(
              practice: practice, sender_membership: member, reply_to_message_id: reply_to_message_id, body: body,
              message_class: message_class, request_key: request_key, linked_object_type: linked&.class&.name&.demodulize&.underscore,
              linked_object_id: linked&.id, requested_action: requested_action, response_due_at: due_at,
              acknowledgement_required: %w[urgent safety_critical].include?(message_class)
            )
            if message_class != "routine"
              message.create_request!(practice: practice, assignee_membership: assignee.membership, due_at: due_at)
            end
            now = Time.current
            conversation.members.active.where.not(membership_id: member.id).find_each do |recipient|
              message.receipts.create!(practice: practice, recipient_membership: recipient.membership, delivered_at: now)
              preference = Clinic::StaffNotificationPreference.find_or_create_by!(practice_id: practice.id, membership_id: recipient.membership_id)
              next if message_class == "routine" && (recipient.notification_policy == "muted" || !preference.routine_enabled)

              message.notifications.create!(practice: practice, recipient_membership: recipient.membership,
                conversation: conversation, category: message_class, title: message_class == "routine" ? "New staff message" : "New #{message_class.tr("_", " ")} staff message")
            end
            conversation.update!(last_message_at: now)
            message.outbox_events.create!(practice: practice, event_type: "in_app_notification", available_at: now)
            Clinic::AuditRecorder.record!(practice: practice, actor: actor,
              action_code: "staff_messaging.message.send", outcome: :committed,
              resource_version_ref: "staff_message:#{message.id}")
            message
          end
        end
        outcome.value
      end
    end
  end
end
