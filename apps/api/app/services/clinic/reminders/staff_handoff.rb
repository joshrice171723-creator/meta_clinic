module Clinic
  module Reminders
    class StaffHandoff
      ACTION_TYPES = %w[request_help request_reschedule].freeze
      MAX_DUE_WINDOW = 30.days
      MESSAGE_BODY = "A patient reminder needs staff follow-up. Open the reminder worklist to review the permitted details."
      REQUESTED_ACTIONS = {
        "delivery_failed" => "Review the failed delivery evidence. Do not resend until you confirm a safe contact method and record the outcome.",
        "delivery_unknown" => "Reconcile the delivery outcome before any resend. Do not send a duplicate while delivery is uncertain.",
        "retry_exhausted" => "Review the retry history and choose a safe contact or documented follow-up. Do not retry this reminder again.",
        "request_help" => "Review the patient's request for help and record the appropriate operational follow-up.",
        "request_reschedule" => "Review the reschedule request through the authorized appointment-request workflow. Do not change the appointment from this message."
      }.freeze
      DEFAULT_REQUESTED_ACTION = "Review the reminder outcome and record the operational follow-up."
      OPERATION_CODE = "reminders.staff_handoff.create"

      SourceEvent = Data.define(:kind, :id, :reason_code) do
        def key
          "reminder-handoff:#{kind}:#{id}"
        end
      end

      def self.call(practice:, actor:, reminder:, conversation_id:, assignee_membership_id:, due_at:, action_id: nil, at: Current.business_time)
        reminder = practice.patient_reminders.find(reminder.id)
        Authorization.authorize!(actor: actor, practice: practice, action: "reminders.write", at: at)
        due_at = due_at&.to_time
        raise ArgumentError, "Choose a response due time." unless due_at

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
          source = source_event!(reminder: reminder, action_id: action_id)
          lock_source!(practice_id: practice.id, source_key: source.key)

          receipt = source_receipt!(practice: practice, source: source)
          if receipt
            message = message_from_receipt!(practice: practice, receipt: receipt, reminder: reminder, source: source)
            validate_existing_target!(message: message, conversation: conversation, assignee: assignee, due_at: due_at)
            Clinic::Messaging::StaffPolicy.conversation_for!(
              practice: practice,
              actor: actor,
              id: message.conversation_id,
              action: "staff_messaging.read"
            )
            return message.request
          end

          unless due_at > at && due_at <= at + MAX_DUE_WINDOW
            raise ArgumentError, "Choose a response target within the next 30 days."
          end

          outcome = Clinic::Idempotency.execute(
            practice: practice,
            actor: actor,
            operation_code: OPERATION_CODE,
            request_key: source.key,
            payload: {
              source_kind: source.kind,
              source_id: source.id,
              conversation_id: conversation.id,
              assignee_membership_id: assignee.membership_id,
              due_at: due_at
            },
            authorization: lambda {
              Authorization.authorize!(actor: actor, practice: practice, action: "reminders.write")
              Clinic::Messaging::StaffPolicy.authorize!(
                practice: practice,
                actor: actor,
                action: "staff_messaging.send",
                site_id: conversation.site_id
              )
            },
            authorization_action: OPERATION_CODE,
            result_resource: ->(message) { message },
            resource_resolver: lambda { |practice:, receipt:|
              Clinic::StaffMessage.find_by(practice_id: practice.id, id: receipt.resource_id)
            }
          ) do
            Clinic::Messaging::SendStaffMessage.call(
              practice: practice,
              actor: actor,
              conversation: conversation,
              request_key: "reminder-message:#{SecureRandom.uuid}",
              body: MESSAGE_BODY,
              message_class: "time_sensitive",
              response_due_at: due_at,
              assignee_membership_id: assignee.membership_id,
              requested_action: requested_action_for(source.reason_code),
              linked_object_type: "patient_reminder",
              linked_object_id: reminder.id
            )
          end

          message = outcome.value
          request = message&.request
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

      def self.summary(reminder:, actor: nil)
        summaries(reminders: [reminder], actor: actor).fetch(reminder.id, empty_summary)
      end

      def self.summaries(reminders:, actor: nil)
        reminders = reminders.to_a
        result = reminders.to_h { |reminder| [reminder.id, empty_summary] }
        return result if actor.nil? || reminders.empty?

        practice = reminders.first.practice
        unless reminders.all? { |reminder| reminder.practice_id == practice.id }
          raise ArgumentError, "Reminder summaries must belong to one practice."
        end
        sources = {}
        reminders.each do |reminder|
          sources[reminder.id] = source_event!(reminder: reminder, action_id: nil)
        rescue ArgumentError, ActiveRecord::RecordNotFound
          next
        end

        receipts_by_key = Clinic::OperationReceipt.where(
          practice_id: practice.id,
          operation_code: OPERATION_CODE,
          request_key: sources.values.map(&:key)
        ).order(:id).group_by(&:request_key)
        message_ids = receipts_by_key.values.filter_map do |receipts|
          receipt = receipt_from_group!(receipts)
          receipt.resource_id if receipt
        rescue Clinic::Idempotency::Conflict
          nil
        end
        messages = Clinic::StaffMessage.where(practice_id: practice.id, id: message_ids)
          .includes(:request, conversation: :members)
          .index_by(&:id)
        read_memberships = {}

        reminders.each do |reminder|
          source = sources[reminder.id]
          next unless source

          receipt = receipt_from_group!(receipts_by_key.fetch(source.key, []))
          message = receipt && messages[receipt.resource_id]
          if receipt
            validate_receipt_message!(message: message, reminder: reminder, source: source)
            membership = read_memberships.fetch(message.conversation.site_id) do |site_id|
              read_memberships[site_id] = Clinic::Messaging::StaffPolicy.authorize!(
                practice: practice,
                actor: actor,
                action: "staff_messaging.read",
                site_id: site_id
              )
            end
            unless message.conversation.members.any? do |member|
              member.membership_state == "active" && member.membership_id == membership.id
            end
              raise ActiveRecord::RecordNotFound
            end
          end

          result[reminder.id] = {
            eligible: true,
            source_type: source.kind,
            source_id: source.id,
            reason_code: source.reason_code,
            request: message&.request && request_summary(message.request)
          }
        rescue ArgumentError, ActiveRecord::RecordNotFound, Clinic::Authorization::Denied, Clinic::Idempotency::Conflict
          result[reminder.id] = empty_summary
        end
        result
      end

      def self.empty_summary
        { eligible: false, source_type: nil, source_id: nil, reason_code: nil, request: nil }
      end
      private_class_method :empty_summary

      def self.requested_action_for(reason_code)
        REQUESTED_ACTIONS.fetch(reason_code.to_s, DEFAULT_REQUESTED_ACTION)
      end
      private_class_method :requested_action_for

      def self.source_event!(reminder:, action_id:)
        action = actionable_action(reminder: reminder, action_id: action_id)
        return SourceEvent.new(kind: "action", id: action.id, reason_code: action.action_type) if action

        attempt = latest_attempt(reminder)
        reason = if reminder.policy_decision_code == "retry_limit_reached" && attempt&.status == "failed"
          "retry_exhausted"
        elsif reminder.status == "delivery_unknown" && attempt&.delivery_uncertain?
          "delivery_unknown"
        elsif reminder.status == "failed" && attempt&.status == "failed"
          "delivery_failed"
        end
        raise ArgumentError, "This reminder does not have an actionable staff follow-up event." unless reason

        SourceEvent.new(kind: "delivery", id: attempt.id, reason_code: reason)
      end
      private_class_method :source_event!

      def self.actionable_action(reminder:, action_id:)
        if reminder.association(:actions).loaded?
          actions = reminder.actions.target.select do |action|
            ACTION_TYPES.include?(action.action_type) && action.outcome == "recorded"
          end
          return actions.find { |action| action.id == action_id.to_i } || raise(ActiveRecord::RecordNotFound) if action_id.present?

          return actions.max_by { |action| [action.created_at, action.id] }
        end

        scope = reminder.actions.where(action_type: ACTION_TYPES, outcome: "recorded")
        action_id.present? ? scope.find(action_id) : scope.order(created_at: :desc, id: :desc).first
      end
      private_class_method :actionable_action

      def self.latest_attempt(reminder)
        return reminder.delivery_attempts.target.max_by(&:attempt_number) if reminder.association(:delivery_attempts).loaded?

        reminder.delivery_attempts.order(attempt_number: :desc).first
      end
      private_class_method :latest_attempt

      def self.source_receipt!(practice:, source:)
        receipts = Clinic::OperationReceipt.where(
          practice_id: practice.id,
          operation_code: OPERATION_CODE,
          request_key: source.key
        ).order(:id).limit(2).to_a
        receipt_from_group!(receipts)
      end
      private_class_method :source_receipt!

      def self.receipt_from_group!(receipts)
        raise Clinic::Idempotency::Conflict, "The reminder handoff source has conflicting receipts." if receipts.many?

        receipt = receipts.first
        return unless receipt
        unless receipt.outcome_committed? && receipt.resource_type == "Clinic::StaffMessage" && receipt.resource_id.present?
          raise Clinic::Idempotency::Conflict, "The reminder handoff outcome is unresolved."
        end

        receipt
      end
      private_class_method :receipt_from_group!

      def self.message_from_receipt!(practice:, receipt:, reminder:, source:)
        message = Clinic::StaffMessage.where(practice_id: practice.id)
          .includes(:request, :conversation)
          .find_by(id: receipt.resource_id)
        validate_receipt_message!(message: message, reminder: reminder, source: source)
      end
      private_class_method :message_from_receipt!

      def self.validate_receipt_message!(message:, reminder:, source:)
        valid = message && message.body == MESSAGE_BODY && message.message_class == "time_sensitive" &&
          message.requested_action == requested_action_for(source.reason_code) && message.linked_object_type == "patient_reminder" &&
          message.linked_object_id == reminder.id && message.request.present?
        return message if valid

        raise Clinic::Idempotency::Conflict, "The reminder handoff receipt does not resolve to its staff request."
      end
      private_class_method :validate_receipt_message!

      def self.validate_existing_target!(message:, conversation:, assignee:, due_at:)
        request = message.request
        return if message.conversation_id == conversation.id &&
          request.assignee_membership_id == assignee.membership_id && request.due_at.utc == due_at.utc

        raise Clinic::Idempotency::Conflict, "This reminder event already has a different staff follow-up target."
      end
      private_class_method :validate_existing_target!

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
