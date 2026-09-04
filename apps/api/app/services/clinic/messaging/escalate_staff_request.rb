module Clinic
  module Messaging
    class EscalateStaffRequest
      MAX_LEVEL = 3

      def self.call(practice:, actor:, request:, request_key:, target_membership_id: nil, trigger: "manual")
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.escalate", site_id: request.message.conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: request.message.conversation, membership_id: member.id)
        target = if target_membership_id.present?
          StaffPolicy.member_in_conversation!(conversation: request.message.conversation, membership_id: target_membership_id)
        else
          request.message.conversation.members.active.where.not(membership_id: [ member.id, request.assignee_membership_id ]).first
        end
        raise ArgumentError, "A backup staff member is required for escalation." unless target
        level = request.escalations.maximum(:level).to_i + 1
        raise ArgumentError, "The escalation limit has been reached." if level > MAX_LEVEL

        payload = { request_id: request.id, level: level, target_membership_id: target.membership_id, trigger: trigger.to_s }
        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "staff_messaging.request.escalate",
          request_key: request_key, payload: payload,
          authorization: -> { StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.escalate", site_id: request.message.conversation.site_id) },
          authorization_action: "staff_messaging.escalate",
          result_resource: ->(escalation) { escalation },
          resource_resolver: ->(practice:, receipt:) { Clinic::StaffMessageEscalation.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          ApplicationRecord.transaction do
            escalation = request.escalations.create!(practice: practice, message: request.message, level: level,
              trigger: trigger.to_s, triggered_at: Time.current, target_membership: target.membership,
              dedupe_key: "request:#{request.id}:level:#{level}")
            escalation.message.notifications.create!(practice: practice, recipient_membership: target.membership,
              conversation: request.message.conversation, category: "escalation", title: "Staff message escalation")
            Clinic::AuditRecorder.record!(practice: practice, actor: actor,
              action_code: "staff_messaging.request.escalate", outcome: :committed,
              resource_version_ref: "staff_message_escalation:#{escalation.id}")
            escalation
          end
        end
        outcome.value
      end
    end
  end
end
