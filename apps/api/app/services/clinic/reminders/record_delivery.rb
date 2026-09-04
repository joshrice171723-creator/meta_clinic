module Clinic
  module Reminders
    class RecordDelivery
      OUTCOMES = %w[delivered failed unknown].freeze

      def self.call(reminder:, actor:, provider_event_reference:, outcome:)
        Authorization.authorize!(actor: actor, practice: reminder.practice, action: "reminders.write")
        outcome = outcome.to_s
        raise ArgumentError, "Choose a supported delivery outcome." unless OUTCOMES.include?(outcome)
        ApplicationRecord.transaction do
          reminder.with_lock do
            attempt = reminder.delivery_attempts.order(attempt_number: :desc).first
            return attempt if attempt&.provider_message_id == provider_event_reference && attempt.status == outcome
            raise ArgumentError, "A delivery attempt is required before recording a provider result." unless attempt
            attempt.update_columns(status: outcome, completed_at: Time.current)
            reminder.outbox.update!(dispatch_state: outcome, lease_until: nil)
            target = outcome == "delivered" ? "delivered" : outcome == "unknown" ? "delivery_unknown" : "failed"
            reminder.update!(status: target)
            AuditRecorder.record!(practice: reminder.practice, actor: actor, action_code: "reminders.delivery.#{outcome}", outcome: :committed,
              resource_version_ref: "patient-reminder:#{reminder.id}:#{provider_event_reference}")
            attempt
          end
        end
      end
    end
  end
end
