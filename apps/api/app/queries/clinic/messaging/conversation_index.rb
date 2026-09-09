module Clinic
  module Messaging
    class ConversationIndex
      TERMINAL_REQUEST_STATES = %w[resolved declined expired].freeze

      class << self
        def call(practice:, ability:, membership:, filter: nil)
          scope = Clinic::StaffConversation.where(practice_id: practice.id).where(
            id: Clinic::StaffConversationMember.active.where(
              practice_id: practice.id, membership_id: membership.id
            ).select(:conversation_id)
          )
          scope = apply_site_scope(scope, ability)
          apply_filter(scope, practice: practice, membership: membership, filter: filter)
        end

        def with_summary(scope, practice:, membership:)
          conversations = Clinic::StaffConversation.table_name
          messages = Clinic::StaffMessage.table_name
          receipts = Clinic::StaffMessageReceipt.table_name
          requests = Clinic::StaffMessageRequest.table_name
          practice_id = ApplicationRecord.connection.quote(practice.id)
          membership_id = ApplicationRecord.connection.quote(membership.id)

          scope.select(
            "#{conversations}.*",
            Arel.sql(<<~SQL.squish),
              EXISTS (
                SELECT 1 FROM #{messages} summary_unread_message
                INNER JOIN #{receipts} summary_unread_receipt
                  ON summary_unread_receipt.practice_id = summary_unread_message.practice_id
                  AND summary_unread_receipt.message_id = summary_unread_message.id
                WHERE summary_unread_message.practice_id = #{practice_id}
                  AND summary_unread_message.conversation_id = #{conversations}.id
                  AND summary_unread_receipt.recipient_membership_id = #{membership_id}
                  AND summary_unread_receipt.read_at IS NULL
              ) AS staff_unread
            SQL
            Arel.sql(<<~SQL.squish),
              EXISTS (
                SELECT 1 FROM #{messages} summary_urgent_message
                WHERE summary_urgent_message.practice_id = #{practice_id}
                  AND summary_urgent_message.conversation_id = #{conversations}.id
                  AND summary_urgent_message.message_class IN ('urgent', 'safety_critical')
                  AND summary_urgent_message.status = 'active'
              ) AS staff_urgent
            SQL
            Arel.sql(<<~SQL.squish),
              EXISTS (
                SELECT 1 FROM #{messages} summary_request_message
                INNER JOIN #{requests} summary_request
                  ON summary_request.practice_id = summary_request_message.practice_id
                  AND summary_request.message_id = summary_request_message.id
                WHERE summary_request_message.practice_id = #{practice_id}
                  AND summary_request_message.conversation_id = #{conversations}.id
                  AND summary_request.state NOT IN ('resolved', 'declined', 'expired')
              ) AS staff_unresolved
            SQL
            Arel.sql(<<~SQL.squish)
              (
                SELECT summary_latest_message.message_class
                FROM #{messages} summary_latest_message
                WHERE summary_latest_message.practice_id = #{practice_id}
                  AND summary_latest_message.conversation_id = #{conversations}.id
                ORDER BY summary_latest_message.created_at DESC, summary_latest_message.id DESC
                LIMIT 1
              ) AS staff_latest_message_class
            SQL
          )
        end

        private

        def apply_site_scope(scope, ability)
          return scope if ability.practice_scope_for?("staff_messaging.read")

          allowed_site_ids = ability.accessible_site_ids.select do |site_id|
            ability.allowed_permission?("staff_messaging.read", site: site_id)
          end
          scope.where(site_id: allowed_site_ids)
        end

        def apply_filter(scope, practice:, membership:, filter:)
          case filter.to_s
          when ""
            scope
          when "unread"
            scope.where(id: unread_conversations(practice: practice, membership: membership))
          when "urgent"
            scope.where(id: urgent_conversations(practice: practice))
          when "assigned"
            scope.where(id: unresolved_conversations(practice: practice, membership: membership))
          when "unresolved"
            scope.where(id: unresolved_conversations(practice: practice))
          else
            scope.none
          end
        end

        def unread_conversations(practice:, membership:)
          Clinic::StaffMessageReceipt.where(
            practice_id: practice.id, recipient_membership_id: membership.id, read_at: nil
          ).joins(:message).where(
            clinic_staff_messages: { practice_id: practice.id }
          ).select("clinic_staff_messages.conversation_id")
        end

        def urgent_conversations(practice:)
          Clinic::StaffMessage.where(
            practice_id: practice.id, message_class: %w[urgent safety_critical], status: "active"
          ).select(:conversation_id)
        end

        def unresolved_conversations(practice:, membership: nil)
          requests = Clinic::StaffMessageRequest.where(practice_id: practice.id)
            .where.not(state: TERMINAL_REQUEST_STATES)
          requests = requests.where(assignee_membership_id: membership.id) if membership
          Clinic::StaffMessage.where(
            practice_id: practice.id, id: requests.select(:message_id)
          ).select(:conversation_id)
        end
      end
    end
  end
end
