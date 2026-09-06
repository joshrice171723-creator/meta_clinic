module Clinic
  module Messaging
    class TransitionStaffRequest
      def self.call(practice:, actor:, request:, state:, resolution_code: nil, resolution_note: nil)
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.transition", site_id: request.message.conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: request.message.conversation, membership_id: member.id)
        state = state.to_s
        resolution_code = resolution_code.to_s.strip.presence
        resolution_note = resolution_note.to_s.strip.presence
        raise ArgumentError, "A resolution code is required when resolving a request." if state == "resolved" && resolution_code.blank?

        ApplicationRecord.transaction do
          locked_request = Clinic::StaffMessageRequest.where(practice_id: practice.id).lock.find(request.id)
          locked_conversation = locked_request.message.conversation
          locked_member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.transition", site_id: locked_conversation.site_id)
          StaffPolicy.member_in_conversation!(conversation: locked_conversation, membership_id: locked_member.id)
          if locked_request.state == state
            same_resolution = locked_request.resolution_code == resolution_code && locked_request.resolution_note == resolution_note
            raise Clinic::Idempotency::Conflict, "That staff request transition was already completed with different resolution details." unless same_resolution

            next locked_request
          end

          locked_request.transition_to!(state, resolution_code: resolution_code, resolution_note: resolution_note)
          Clinic::AuditRecorder.record!(practice: practice, actor: actor,
            action_code: "staff_messaging.request.transition", outcome: :committed,
            resource_version_ref: "staff_message_request:#{locked_request.id}")
          locked_request
        end
      end
    end
  end
end
