require "digest"

module Clinic
  module Reminders
    # Staff-recorded evidence, not an authenticated provider callback.
    class RecordDelivery
      OUTCOMES = %w[delivered failed unknown].freeze

      RECORDABLE_STATES = %w[queued accepted delivered failed unknown].freeze
      PRESERVED_REMINDER_STATES = %w[cancelled suppressed expired actioned paused].freeze

      def self.call(reminder:, actor:, provider_event_reference:, outcome:, delivery_attempt_id: nil, request_key: nil)
        authorize = -> { Authorization.authorize!(actor: actor, practice: reminder.practice, action: "reminders.write") }
        authorize.call
        outcome = outcome.to_s
        reference = provider_event_reference.to_s.strip
        raise ArgumentError, "Choose a supported delivery outcome." unless OUTCOMES.include?(outcome)
        raise ArgumentError, "A delivery event reference is required." if reference.blank? || reference.length > 120

        # Legacy callers may correlate a provider message ID. Never fall back to
        # the latest attempt: a late result must not affect a subsequent send.
        attempt = if delivery_attempt_id.present?
          reminder.delivery_attempts.find(delivery_attempt_id)
        else
          reminder.delivery_attempts.find_by!(provider_message_id: reference)
        end
        payload = { reminder_id: reminder.id, delivery_attempt_id: attempt.id, event_reference: reference, outcome: outcome }
        key = request_key.presence || "reminder-delivery:#{Digest::SHA256.hexdigest("#{reminder.id}:#{reference}")}"
        result = Idempotency.execute(
          practice: reminder.practice, actor: actor, operation_code: "reminders.staff_delivery.record",
          request_key: key, payload: payload, authorization: authorize,
          authorization_action: "reminders.write", result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) {
            reminder.delivery_attempts.find_by(practice_id: practice.id, id: receipt.resource_id)
          }
        ) do
          reminder.lock!
          attempt.reload
          raise ArgumentError, "This attempt has no dispatch outcome to reconcile." unless RECORDABLE_STATES.include?(attempt.status)

          unless attempt.status == outcome
            if attempt.status == "delivered" || (attempt.status == "failed" && outcome == "unknown")
              raise ArgumentError, "A delivery result cannot regress a confirmed outcome."
            end
            # A manual report is not provider-confirmed evidence of a safe retry.
            attempt.update_columns(
              status: outcome, failure_class: outcome == "failed" ? "staff_reported_failed" : nil,
              retryable: false, completed_at: Time.current, updated_at: Time.current
            )
            latest_id = reminder.delivery_attempts.order(attempt_number: :desc).pick(:id)
            if latest_id == attempt.id && reminder.cancelled_at.nil? && !PRESERVED_REMINDER_STATES.include?(reminder.status)
              reminder.outbox.update!(dispatch_state: outcome, lease_until: nil)
              target = outcome == "unknown" ? "delivery_unknown" : outcome
              reminder.update!(status: target)
            end
            AuditRecorder.record!(practice: reminder.practice, actor: actor,
              action_code: "reminders.staff_delivery.#{outcome}", outcome: :committed,
              resource_version_ref: "patient-reminder-attempt:#{attempt.id}")
          end
          attempt
        end
        result.value
      end
    end
  end
end
