module Clinic
  module Messaging
    class CreateStaffConversation
      def self.call(practice:, actor:, request_key:, kind:, title: nil, site_id: nil, member_ids: [])
        member = StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.create_conversation", site_id: site_id)
        kind = kind.to_s
        raise ArgumentError, "The conversation kind is unsupported." unless StaffConversation::KINDS.include?(kind)
        title = title.to_s.strip.presence
        raise ArgumentError, "A team conversation needs a title." if %w[team role].include?(kind) && title.blank?

        ids = [ member.id, *Array(member_ids).map(&:to_i) ].uniq
        raise ArgumentError, "A direct conversation needs exactly two staff members." if kind == "direct" && ids.length != 2
        raise ArgumentError, "A conversation needs at least two staff members." if ids.length < 2
        active_ids = practice.memberships.active.where(id: ids).pluck(:id)
        raise ActiveRecord::RecordNotFound unless active_ids.sort == ids.sort

        payload = { kind: kind, title: title, site_id: site_id, member_ids: ids }
        outcome = Clinic::Idempotency.execute(
          practice: practice, actor: actor, operation_code: "staff_messaging.conversation.create",
          request_key: request_key, payload: payload,
          authorization: -> { StaffPolicy.authorize!(practice: practice, actor: actor, action: "staff_messaging.create_conversation", site_id: site_id) },
          authorization_action: "staff_messaging.create_conversation",
          result_resource: ->(conversation) { conversation },
          resource_resolver: ->(practice:, receipt:) { Clinic::StaffConversation.find_by(practice_id: practice.id, id: receipt.resource_id) }
        ) do
          ApplicationRecord.transaction do
            conversation = Clinic::StaffConversation.create!(
              site_id: site_id, kind: kind, title: title, created_by_membership: member,
              retention_class: "routine", last_message_at: nil
            )
            ids.each do |membership_id|
              conversation.members.create!(practice: practice, membership_id: membership_id, joined_at: Time.current)
            end
            Clinic::AuditRecorder.record!(practice: practice, actor: actor,
              action_code: "staff_messaging.conversation.create", outcome: :committed,
              resource_version_ref: "staff_conversation:#{conversation.id}")
            conversation
          end
        end
        outcome.value
      end
    end
  end
end
