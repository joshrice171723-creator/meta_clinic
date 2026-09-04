module Clinic
  module Reminders
    class Dispatch
      MAX_ATTEMPTS = 3

      def self.call(reminder:, actor:, at: Time.current)
        Authorization.authorize!(actor: actor, practice: reminder.practice, action: "reminders.write")
        ApplicationRecord.transaction do
          reminder.with_lock do
            return reminder if reminder.cancelled_at.present? || %w[cancelled expired suppressed actioned].include?(reminder.status)
            decision = Policy.evaluate(reminder: reminder, at: at)
            unless decision[:allowed]
              reminder.update!(status: "suppressed", policy_decision_code: decision[:code], policy_version: decision[:version])
              reminder.outbox.update!(dispatch_state: "suppressed")
              AuditRecorder.record!(practice: reminder.practice, actor: actor, action_code: "reminders.suppressed", outcome: :committed,
                resource_version_ref: "patient-reminder:#{reminder.id}:#{decision[:code]}")
              return reminder
            end
            attempt_number = reminder.delivery_attempts.maximum(:attempt_number).to_i + 1
            raise ArgumentError, "Reminder retry limit reached." if attempt_number > MAX_ATTEMPTS
            reminder.update!(status: "queued", policy_decision_code: "eligible", policy_version: decision[:version]) if reminder.status == "scheduled" || reminder.status == "failed" || reminder.status == "delivery_unknown"
            outbox = reminder.outbox
            outbox.update!(dispatch_state: "leased", lease_until: at + 5.minutes)
            attempt = reminder.delivery_attempts.create!(practice: reminder.practice, attempt_number: attempt_number,
              provider: "synthetic", idempotency_key: "#{outbox.idempotency_key}:#{attempt_number}", status: "queued",
              masked_destination: reminder.communication_endpoint.masked_value, queued_at: at)
            result = Providers::Synthetic.send(reminder: reminder, idempotency_key: attempt.idempotency_key)
            case result.fetch(:status)
            when :accepted
              attempt.update_columns(status: "accepted", accepted_at: at, provider_message_id: result[:provider_message_id], completed_at: at)
              outbox.update!(dispatch_state: "accepted", provider_message_id: result[:provider_message_id], lease_until: nil)
              reminder.update!(status: "provider_accepted")
            when :outage
              attempt.update_columns(status: "failed", failure_class: "provider_outage", retryable: true, completed_at: at)
              outbox.update!(dispatch_state: "failed", lease_until: nil)
              reminder.update!(status: "failed", policy_decision_code: "provider_outage")
            else
              attempt.update_columns(status: "gated", failure_class: "provider_gated", completed_at: at)
              outbox.update!(dispatch_state: "pending", lease_until: nil)
              reminder.update!(status: "queued", policy_decision_code: "provider_gated")
            end
            reminder
          end
        end
      end
    end
  end
end
