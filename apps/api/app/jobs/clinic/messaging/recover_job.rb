module Clinic
  module Messaging
    class RecoverJob < ApplicationJob
      def perform(practice_id:, actor_id:, conversation_id:, target_membership_id: nil,
        outbox_limit: Recover::DEFAULT_LIMIT, request_limit: Recover::DEFAULT_LIMIT)
        practice = Clinic::Practice.find(practice_id)
        actor = User.find_by!(id: actor_id, active: true)
        conversation = Clinic::StaffConversation.find_by!(practice_id: practice.id, id: conversation_id)

        PaperTrail.request(
          whodunnit: actor.id.to_s,
          controller_info: {
            job_id: job_id,
            causal_id: "staff-messaging-recovery:#{conversation.id}"
          }
        ) do
          Recover.call(
            practice: practice,
            actor: actor,
            conversation: conversation,
            target_membership_id: target_membership_id,
            outbox_limit: outbox_limit,
            request_limit: request_limit
          )
        end
      end
    end
  end
end
