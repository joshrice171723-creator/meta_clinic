module Clinic
  module Messaging
    class EscalateStaffRequest
      MAX_LEVEL = 3
      TERMINAL_STATES = %w[resolved declined expired].freeze
      OVERDUE_TRIGGER = "overdue_recovery"

      def self.call(practice:, actor:, request:, request_key:, target_membership_id: nil, trigger: "manual")
        conversation = request.message.conversation
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.escalate", site_id: conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: member.id)
        target = if target_membership_id.present?
          active_conversation_member!(conversation: conversation, membership_id: target_membership_id)
        else
          conversation.members.active.joins(:membership)
            .where(clinic_memberships: { active: true })
            .where.not(membership_id: [ member.id, request.assignee_membership_id ])
            .order("clinic_staff_conversation_members.id ASC").first
        end
        raise ArgumentError, "A backup staff member is required for escalation." unless target
        trigger = trigger.to_s
        if trigger == OVERDUE_TRIGGER && target.membership_id.in?([ member.id, request.assignee_membership_id ])
          raise ArgumentError, "The selected staff member is not a backup for this request."
        end

        payload = { request_id: request.id, target_membership_id: target.membership_id, trigger: trigger }
        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "staff_messaging.request.escalate",
          request_key: request_key, payload: payload,
          authorization: lambda {
            current_member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.escalate", site_id: conversation.site_id)
            StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: current_member.id)
            active_conversation_member!(conversation: conversation, membership_id: target.membership_id)
          },
          authorization_action: "staff_messaging.escalate",
          result_resource: ->(escalation) { escalation },
          resource_resolver: ->(practice:, receipt:) { Clinic::StaffMessageEscalation.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          ApplicationRecord.transaction do
            locked_request = Clinic::StaffMessageRequest.where(practice_id: practice.id).lock.find(request.id)
            raise ArgumentError, "A completed staff request cannot be escalated." if TERMINAL_STATES.include?(locked_request.state)
            if trigger == OVERDUE_TRIGGER && locked_request.due_at > Current.business_time
              raise ArgumentError, "The staff request is not overdue."
            end

            locked_target = active_conversation_member!(conversation: conversation, membership_id: target.membership_id)
            if trigger == OVERDUE_TRIGGER && locked_target.membership_id.in?([ member.id, locked_request.assignee_membership_id ])
              raise ArgumentError, "The selected staff member is not a backup for this request."
            end
            if trigger == OVERDUE_TRIGGER
              existing = locked_request.escalations.find_by(
                trigger: trigger, target_membership_id: locked_target.membership_id
              )
              next existing if existing
            end
            level = locked_request.escalations.maximum(:level).to_i + 1
            raise ArgumentError, "The escalation limit has been reached." if level > MAX_LEVEL

            escalation = locked_request.escalations.create!(practice: practice, message: locked_request.message, level: level,
              trigger: trigger, triggered_at: Time.current, target_membership: locked_target.membership,
              dedupe_key: "request:#{locked_request.id}:level:#{level}")
            escalation.message.notifications.create!(practice: practice, recipient_membership: locked_target.membership,
              conversation: conversation, category: "escalation", title: "Staff message escalation")
            Clinic::AuditRecorder.record!(practice: practice, actor: actor,
              action_code: "staff_messaging.request.escalate", outcome: :committed,
              resource_version_ref: "staff_message_escalation:#{escalation.id}")
            escalation
          end
        end
        outcome.value
      end

      def self.active_conversation_member!(conversation:, membership_id:)
        member = conversation.members.active.joins(:membership)
          .where(clinic_memberships: { active: true })
          .find_by(membership_id: membership_id)
        raise ActiveRecord::RecordNotFound unless member

        member
      end
      private_class_method :active_conversation_member!
    end
  end
end
