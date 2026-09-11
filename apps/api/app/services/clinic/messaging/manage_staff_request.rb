module Clinic
  module Messaging
    class ManageStaffRequest
      ACTIONS = %w[claim assign schedule].freeze
      TERMINAL_STATES = %w[resolved declined expired].freeze

      def self.call(practice:, actor:, request:, request_key:, action:, assignee_membership_id: nil, due_at: nil)
        action = action.to_s
        raise ArgumentError, "The staff request action is unsupported." unless ACTIONS.include?(action)

        conversation = request.message.conversation
        member = StaffPolicy.authorize!(
          practice: practice, actor: actor, action: "staff_messaging.transition", site_id: conversation.site_id
        )
        StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: member.id)
        target_id = action == "claim" ? member.id : assignee_membership_id
        raise ArgumentError, "Select a staff member to receive this request." if action == "assign" && target_id.blank?
        target = target_id.present? ? active_conversation_member!(conversation: conversation, membership_id: target_id) : nil
        scheduled_at = due_at.present? ? due_at.to_time : nil
        if action == "schedule"
          raise ArgumentError, "A future response target is required." unless scheduled_at && scheduled_at > Current.business_time
          raise ArgumentError, "The response target cannot be more than 30 days away." if scheduled_at > Current.business_time + 30.days
        end

        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: "staff_messaging.request.manage",
          request_key: request_key,
          payload: {
            request_id: request.id,
            action: action,
            assignee_membership_id: target&.membership_id,
            due_at: scheduled_at&.iso8601(6)
          },
          authorization: lambda {
            current_member = StaffPolicy.authorize!(
              practice: practice, actor: actor, action: "staff_messaging.transition", site_id: conversation.site_id
            )
            StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: current_member.id)
            active_conversation_member!(conversation: conversation, membership_id: target.membership_id) if target
          },
          authorization_action: "staff_messaging.transition",
          result_resource: ->(managed_request) { managed_request },
          resource_resolver: lambda { |practice:, receipt:|
            Clinic::StaffMessageRequest.find_by(practice_id: practice.id, id: receipt.resource_id)
          }
        ) do
          ApplicationRecord.transaction do
            locked_request = Clinic::StaffMessageRequest.where(practice_id: practice.id)
              .includes(message: :conversation).lock.find(request.id)
            raise ArgumentError, "A completed staff request cannot be reassigned or rescheduled." if TERMINAL_STATES.include?(locked_request.state)

            locked_conversation = locked_request.message.conversation
            locked_member = StaffPolicy.authorize!(
              practice: practice, actor: actor, action: "staff_messaging.transition", site_id: locked_conversation.site_id
            )
            StaffPolicy.member_in_conversation!(conversation: locked_conversation, membership_id: locked_member.id)
            attributes = if action == "schedule"
              { due_at: scheduled_at }
            else
              locked_target = active_conversation_member!(
                conversation: locked_conversation, membership_id: target.membership_id
              )
              { assignee_membership: locked_target.membership }
            end
            locked_request.update!(attributes)
            Clinic::Care::StaffRequestTaskProjection.sync!(request: locked_request, actor_membership: locked_member)
            Clinic::AuditRecorder.record!(
              practice: practice,
              actor: actor,
              action_code: "staff_messaging.request.#{action}",
              outcome: :committed,
              resource_version_ref: "staff_message_request:#{locked_request.id}"
            )
            locked_request
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
