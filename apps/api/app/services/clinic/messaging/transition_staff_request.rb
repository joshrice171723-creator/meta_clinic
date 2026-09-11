module Clinic
  module Messaging
    class TransitionStaffRequest
      def self.call(practice:, actor:, request:, state:, resolution_code: nil, resolution_note: nil,
        request_key: nil, expected_updated_at: nil)
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.transition", site_id: request.message.conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: request.message.conversation, membership_id: member.id)
        state = state.to_s
        resolution_code = resolution_code.to_s.strip.presence
        resolution_note = resolution_note.to_s.strip.presence
        raise ArgumentError, "A resolution code is required when resolving a request." if state == "resolved" && resolution_code.blank?

        operation = lambda do
          ApplicationRecord.transaction do
            locked_request = Clinic::StaffMessageRequest.where(practice_id: practice.id).lock.find(request.id)
            if expected_updated_at.present? && locked_request.updated_at.iso8601(6) != expected_updated_at.to_s
              raise ActiveRecord::StaleObjectError.new(locked_request, "transition")
            end
            locked_conversation = locked_request.message.conversation
            locked_member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.transition", site_id: locked_conversation.site_id)
            StaffPolicy.member_in_conversation!(conversation: locked_conversation, membership_id: locked_member.id)
            if locked_request.state == state
              same_resolution = locked_request.resolution_code == resolution_code && locked_request.resolution_note == resolution_note
              raise Clinic::Idempotency::Conflict, "That staff request transition was already completed with different resolution details." unless same_resolution

              next locked_request
            end

            locked_request.transition_to!(state, resolution_code: resolution_code, resolution_note: resolution_note)
            Clinic::Care::StaffRequestTaskProjection.sync!(request: locked_request, actor_membership: locked_member)
            Clinic::AuditRecorder.record!(practice: practice, actor: actor,
              action_code: "staff_messaging.request.transition", outcome: :committed,
              resource_version_ref: "staff_message_request:#{locked_request.id}")
            locked_request
          end
        end

        return operation.call if request_key.blank?

        outcome = Clinic::Idempotency.execute(
          practice: practice,
          actor: actor,
          operation_code: "staff_messaging.request.transition",
          request_key: request_key,
          resource: request,
          authorization_action: "staff_messaging.transition",
          authorization: lambda {
            current_member = StaffPolicy.authorize!(practice: practice, actor: actor,
              action: "staff_messaging.transition", site_id: request.message.conversation.site_id)
            StaffPolicy.member_in_conversation!(conversation: request.message.conversation, membership_id: current_member.id)
          },
          payload: {
            request_id: request.id,
            state: state,
            resolution_code: resolution_code,
            resolution_note: resolution_note,
            expected_updated_at: expected_updated_at
          },
          result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) {
            Clinic::StaffMessageRequest.find_by(practice_id: practice.id, id: receipt.resource_id)
          }
        ) { operation.call }
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
