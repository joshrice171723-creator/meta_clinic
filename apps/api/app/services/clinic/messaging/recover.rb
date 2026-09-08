module Clinic
  module Messaging
    class Recover
      DEFAULT_LIMIT = 25
      MAX_LIMIT = 100
      MAX_ATTEMPTS = 5
      MAX_RECIPIENTS_PER_MESSAGE = 100
      RETRY_BASE_DELAY = 1.minute
      RECOVERABLE_OUTBOX_STATES = %w[pending in_flight failed].freeze
      TERMINAL_REQUEST_STATES = %w[resolved declined expired].freeze
      IN_APP_NOTIFICATION_EVENT = "in_app_notification"

      def self.call(practice:, actor:, conversation:, target_membership_id: nil,
        outbox_limit: DEFAULT_LIMIT, request_limit: DEFAULT_LIMIT, now: Time.current,
        outbox_event_ids: nil, process_overdue_requests: true)
        authorization_action = process_overdue_requests ? "staff_messaging.escalate" : "staff_messaging.send"
        actor_member = authorize_actor!(
          practice: practice, actor: actor, conversation: conversation, action: authorization_action
        )
        outbox_limit = bounded_limit(outbox_limit)
        request_limit = bounded_limit(request_limit)

        result = {
          outbox: { considered: 0, delivered: 0, retried: 0, quarantined: 0, skipped: 0 },
          overdue_requests: { considered: 0, escalated: 0, blocked: 0, skipped: 0 }
        }

        outbox_ids(
          practice: practice, conversation: conversation, now: now, limit: outbox_limit,
          outbox_event_ids: outbox_event_ids
        ).each do |event_id|
          result[:outbox][:considered] += 1
          outcome = recover_outbox_event(
            practice: practice, actor: actor, conversation: conversation, event_id: event_id, now: now,
            authorization_action: authorization_action
          )
          result[:outbox][outcome] += 1
        end

        return result unless process_overdue_requests

        target = if target_membership_id.present?
          active_conversation_member(conversation: conversation, membership_id: target_membership_id)
        end
        requests = overdue_requests(
          practice: practice,
          conversation: conversation,
          target_membership_id: target&.membership_id,
          now: now,
          limit: request_limit
        )
        result[:overdue_requests][:considered] = requests.length
        if target_membership_id.blank? || !target
          result[:overdue_requests][:blocked] = requests.length
          return result
        end

        requests.each do |request|
          if target.membership_id.in?([ actor_member.id, request.assignee_membership_id ])
            result[:overdue_requests][:blocked] += 1
            next
          end

          begin
            EscalateStaffRequest.call(
              practice: practice,
              actor: actor,
              request: request,
              request_key: recovery_request_key(request: request, target_membership_id: target.membership_id),
              target_membership_id: target.membership_id,
              trigger: EscalateStaffRequest::OVERDUE_TRIGGER
            )
            result[:overdue_requests][:escalated] += 1
          rescue ArgumentError, ActiveRecord::RecordNotFound
            result[:overdue_requests][:skipped] += 1
          end
        end

        result
      end

      def self.recover_outbox_event(practice:, actor:, conversation:, event_id:, now:, authorization_action:)
        ApplicationRecord.transaction do
          authorize_actor!(practice: practice, actor: actor, conversation: conversation, action: authorization_action)
          event = Clinic::StaffMessageOutbox.where(practice_id: practice.id).lock.find(event_id)
          unless event.message.conversation_id == conversation.id &&
              RECOVERABLE_OUTBOX_STATES.include?(event.delivery_state) && event.available_at <= now
            next :skipped
          end

          if event.attempts >= MAX_ATTEMPTS
            event.update!(delivery_state: "failed", last_error: "Staff message outbox retry limit reached.")
            next :quarantined
          end

          attempts = event.attempts + 1
          if event.event_type != IN_APP_NOTIFICATION_EVENT
            event.update!(delivery_state: "failed", attempts: attempts,
              last_error: "Unsupported staff message outbox event type.")
            next :quarantined
          end
          unless event.message.status == "active"
            event.update!(delivery_state: "failed", attempts: attempts,
              last_error: "Staff message is no longer active.")
            next :quarantined
          end

          event.update!(delivery_state: "in_flight", attempts: attempts, last_error: nil)
          reconcile_in_app_notification!(practice: practice, message: event.message, now: now)
          event.update!(delivery_state: "delivered", delivered_at: now, last_error: nil)
          :delivered
        end
      rescue ActiveRecord::RecordNotFound
        :skipped
      rescue Clinic::Authorization::Denied
        :skipped
      rescue StandardError => error
        retry_or_quarantine(event_id: event_id, practice: practice, now: now, error: error)
      end
      private_class_method :recover_outbox_event

      def self.retry_or_quarantine(event_id:, practice:, now:, error:)
        ApplicationRecord.transaction do
          event = Clinic::StaffMessageOutbox.where(practice_id: practice.id).lock.find(event_id)
          return :skipped if event.delivery_state == "delivered"

          attempts = event.attempts + 1
          terminal = attempts >= MAX_ATTEMPTS
          event.update!(
            delivery_state: terminal ? "failed" : "pending",
            attempts: attempts,
            available_at: terminal ? event.available_at : now + retry_delay(attempts),
            last_error: "In-app notification reconciliation failed (#{error.class.name})."
          )
          terminal ? :quarantined : :retried
        end
      rescue ActiveRecord::RecordNotFound
        :skipped
      end
      private_class_method :retry_or_quarantine

      def self.reconcile_in_app_notification!(practice:, message:, now:)
        recipients = active_recipients(message).limit(MAX_RECIPIENTS_PER_MESSAGE + 1).to_a
        if recipients.length > MAX_RECIPIENTS_PER_MESSAGE
          raise ArgumentError, "Staff message recipient limit exceeded."
        end

        recipients.each do |conversation_member|
          receipt = message.receipts.find_or_create_by!(
            practice: practice, recipient_membership: conversation_member.membership
          ) do |new_receipt|
            new_receipt.delivered_at = now
          end
          receipt.update!(delivered_at: now) unless receipt.delivered_at
          next unless notification_required?(practice: practice, message: message, conversation_member: conversation_member)

          message.notifications.find_or_create_by!(
            practice: practice,
            recipient_membership: conversation_member.membership,
            conversation: message.conversation,
            category: message.message_class,
            title: notification_title(message.message_class)
          )
        end
      end
      private_class_method :reconcile_in_app_notification!

      def self.active_recipients(message)
        message.conversation.members.active.joins(:membership)
          .where(clinic_memberships: { active: true })
          .where.not(membership_id: message.sender_membership_id)
          .order("clinic_staff_conversation_members.id ASC")
      end
      private_class_method :active_recipients

      def self.notification_required?(practice:, message:, conversation_member:)
        return true unless message.message_class == "routine"
        return false if conversation_member.notification_policy == "muted"

        preference = Clinic::StaffNotificationPreference.find_or_create_by!(
          practice: practice, membership: conversation_member.membership
        )
        preference.routine_enabled
      end
      private_class_method :notification_required?

      def self.notification_title(message_class)
        message_class == "routine" ? "New staff message" : "New #{message_class.tr("_", " ")} staff message"
      end
      private_class_method :notification_title

      def self.authorize_actor!(practice:, actor:, conversation:, action: "staff_messaging.escalate")
        raise ActiveRecord::RecordNotFound unless conversation.practice_id == practice.id

        member = StaffPolicy.authorize!(practice: practice, actor: actor,
          action: action, site_id: conversation.site_id)
        StaffPolicy.member_in_conversation!(conversation: conversation, membership_id: member.id)
        member
      end
      private_class_method :authorize_actor!

      def self.active_conversation_member(conversation:, membership_id:)
        conversation.members.active.joins(:membership)
          .where(clinic_memberships: { active: true })
          .find_by(membership_id: membership_id)
      end
      private_class_method :active_conversation_member

      def self.outbox_ids(practice:, conversation:, now:, limit:, outbox_event_ids: nil)
        relation = Clinic::StaffMessageOutbox.joins(:message)
          .where(practice_id: practice.id)
          .where(clinic_staff_messages: { conversation_id: conversation.id })
          .where("clinic_staff_message_outbox.available_at <= ?", now)
          .where(<<~SQL.squish, %w[pending in_flight], "failed", IN_APP_NOTIFICATION_EVENT, MAX_ATTEMPTS)
            clinic_staff_message_outbox.delivery_state IN (?) OR
              (clinic_staff_message_outbox.delivery_state = ? AND
                clinic_staff_message_outbox.event_type = ? AND
                clinic_staff_message_outbox.attempts < ?)
          SQL
        relation = relation.where(id: Array(outbox_event_ids)) if outbox_event_ids
        relation.order("clinic_staff_message_outbox.available_at ASC", "clinic_staff_message_outbox.id ASC")
          .limit(limit).pluck(:id)
      end
      private_class_method :outbox_ids

      def self.overdue_requests(practice:, conversation:, target_membership_id:, now:, limit:)
        requests = Clinic::StaffMessageRequest.joins(:message)
          .where(practice_id: practice.id)
          .where(clinic_staff_messages: { conversation_id: conversation.id })
          .where.not(state: TERMINAL_REQUEST_STATES)
          .where("clinic_staff_message_requests.due_at <= ?", now)
          .where(<<~SQL.squish, EscalateStaffRequest::MAX_LEVEL)
            (SELECT COUNT(*) FROM clinic_staff_message_escalations
              WHERE clinic_staff_message_escalations.practice_id = clinic_staff_message_requests.practice_id
                AND clinic_staff_message_escalations.request_id = clinic_staff_message_requests.id) < ?
          SQL
        if target_membership_id
          previously_recovered = Clinic::StaffMessageEscalation.where(
            practice_id: practice.id,
            trigger: EscalateStaffRequest::OVERDUE_TRIGGER,
            target_membership_id: target_membership_id
          ).select(:request_id)
          requests = requests.where.not(id: previously_recovered)
        end

        requests
          .order("clinic_staff_message_requests.due_at ASC", "clinic_staff_message_requests.id ASC")
          .limit(limit).to_a
      end
      private_class_method :overdue_requests

      def self.recovery_request_key(request:, target_membership_id:)
        "staff-recovery:request:#{request.id}:due:#{request.due_at.to_i}:target:#{target_membership_id}"
      end
      private_class_method :recovery_request_key

      def self.retry_delay(attempts)
        [ RETRY_BASE_DELAY * (2**(attempts - 1)), 1.hour ].min
      end
      private_class_method :retry_delay

      def self.bounded_limit(value)
        Integer(value).clamp(1, MAX_LIMIT)
      rescue ArgumentError, TypeError
        raise ArgumentError, "Recovery limit must be an integer."
      end
      private_class_method :bounded_limit
    end
  end
end
