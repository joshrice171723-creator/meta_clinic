module Clinic
  module Reminders
    class StaffHandoff
      ACTION_TYPES = %w[request_help request_reschedule].freeze
      FOLLOW_UP_WINDOW = 30.days
      MESSAGE_BODY = "A patient reminder needs staff follow-up. Open the reminder worklist to review the permitted details."
      REQUESTED_ACTION = "Review the reminder outcome and record the operational follow-up."
      OPERATION_CODE = "reminders.staff_handoff.create"

      SourceEvent = Data.define(:kind, :id, :occurred_at, :reason_code) do
        def key
          "reminder-handoff:#{kind}:#{id}"
        end

        def due_at
          occurred_at + StaffHandoff::FOLLOW_UP_WINDOW
        end
      end

      def self.call(practice:, actor:, reminder:, conversation_id:, assignee_membership_id:, action_id: nil, at: Time.current)
        reminder = practice.patient_reminders.find(reminder.id)
        Authorization.authorize!(actor: actor, practice: practice, action: "reminders.write", at: at)
        conversation = Clinic::Messaging::StaffPolicy.conversation_for!(
          practice: practice,
          actor: actor,
          id: conversation_id,
          action: "staff_messaging.send"
        )
        raise ArgumentError, "Choose an active staff conversation." unless conversation.status == "active"

        assignee = Clinic::Messaging::StaffPolicy.member_in_conversation!(
          conversation: conversation,
          membership_id: assignee_membership_id
        )

        ApplicationRecord.transaction do
          reminder.lock!
          source = source_event!(reminder:, action_id: action_id)
          raise ArgumentError, "This reminder event is outside the staff follow-up window." unless source.due_at > at

          lock_source!(practice_id: practice.id, source_key: source.key)
          existing = existing_message!(practice: practice, source: source)
          if existing
            Clinic::Messaging::StaffPolicy.conversation_for!(
              practice: practice,
              actor: actor,
              id: existing.conversation_id,
              action: "staff_messaging.read"
            )
            return existing.request
          end

          message = Clinic::Messaging::SendStaffMessage.call(
            practice: practice,
            actor: actor,
            conversation: conversation,
            request_key: source.key,
            body: MESSAGE_BODY,
            message_class: "time_sensitive",
            response_due_at: source.due_at,
            assignee_membership_id: assignee.membership_id,
            requested_action: REQUESTED_ACTION
          )
          request = message.request
          raise ActiveRecord::RecordInvalid.new(message) unless request

          Clinic::AuditRecorder.record!(
            practice: practice,
            actor: actor,
            action_code: OPERATION_CODE,
            outcome: :committed,
            resource_version_ref: "reminder-handoff:#{source.kind}:#{source.id}:staff-request:#{request.id}"
          )
          request
        end
      end

      def self.summary(reminder:, at: Time.current)
        source = source_event!(reminder: reminder, action_id: nil)
        existing = existing_message!(practice: reminder.practice, source: source)
        request = existing&.request
        {
          eligible: request.present? || source.due_at > at,
          source_type: source.kind,
          source_id: source.id,
          reason_code: source.reason_code,
          request: request && request_summary(request)
        }
      rescue ArgumentError, ActiveRecord::RecordNotFound, Clinic::Idempotency::Conflict
        { eligible: false, source_type: nil, source_id: nil, reason_code: nil, request: nil }
      end

      def self.source_event!(reminder:, action_id:)
        action = if action_id.present?
          reminder.actions.where(action_type: ACTION_TYPES, outcome: "recorded").find(action_id)
        else
          reminder.actions.where(action_type: ACTION_TYPES, outcome: "recorded").order(created_at: :desc, id: :desc).first
        end
        return SourceEvent.new(kind: "action", id: action.id, occurred_at: action.created_at, reason_code: action.action_type) if action

        attempt = reminder.delivery_attempts.order(attempt_number: :desc).first
        reason = if reminder.policy_decision_code == "retry_limit_reached" && attempt&.status == "failed"
          "retry_exhausted"
        elsif reminder.status == "delivery_unknown" && attempt&.delivery_uncertain?
          "delivery_unknown"
        elsif reminder.status == "failed" && attempt&.status == "failed"
          "delivery_failed"
        end
        raise ArgumentError, "This reminder does not have an actionable staff follow-up event." unless reason

        occurred_at = attempt.completed_at || attempt.updated_at || attempt.created_at
        SourceEvent.new(kind: "delivery", id: attempt.id, occurred_at: occurred_at, reason_code: reason)
      end
      private_class_method :source_event!

      def self.existing_message!(practice:, source:)
        messages = Clinic::StaffMessage.where(practice_id: practice.id, request_key: source.key)
          .includes(:request, :conversation)
          .order(:id)
          .limit(2)
          .to_a
        raise Clinic::Idempotency::Conflict, "The reminder handoff source has conflicting messages." if messages.many?

        message = messages.first
        return unless message
        valid = message.body == MESSAGE_BODY && message.message_class == "time_sensitive" &&
          message.requested_action == REQUESTED_ACTION && message.linked_object_type.nil? &&
          message.linked_object_id.nil? && message.request.present? && message.request.due_at == source.due_at
        raise Clinic::Idempotency::Conflict, "The reminder handoff source conflicts with an existing message." unless valid

        message
      end
      private_class_method :existing_message!

      def self.lock_source!(practice_id:, source_key:)
        connection = ApplicationRecord.connection
        lock_key = "clinic-reminder-handoff:#{practice_id}:#{source_key}"
        connection.execute("SELECT pg_advisory_xact_lock(hashtextextended(#{connection.quote(lock_key)}, 0))")
      end
      private_class_method :lock_source!

      def self.request_summary(request)
        {
          id: request.id,
          state: request.state,
          assignee_membership_id: request.assignee_membership_id,
          due_at: request.due_at&.iso8601(6)
        }
      end
      private_class_method :request_summary
    end
  end
end
