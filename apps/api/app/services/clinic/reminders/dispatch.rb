module Clinic
  module Reminders
    class Dispatch
      MAX_ATTEMPTS = 3
      LEASE_DURATION = 5.minutes
      RETRY_DELAY = 5.minutes
      TERMINAL_STATUSES = %w[cancelled expired suppressed actioned delivered].freeze

      def self.call(reminder:, actor:, at: Time.current)
        Authorization.authorize!(actor: actor, practice: reminder.practice, action: "reminders.write", at: at)
        claim = claim_attempt(reminder:, actor:, at:)
        return claim.fetch(:reminder) unless claim[:attempt]

        attempt = claim.fetch(:attempt)
        return reminder.reload unless ready_to_send?(reminder:, attempt:, actor:, at:)

        result = deliver(reminder:, attempt:)
        finalize(reminder:, attempt:, actor:, result:, at:)
      end

      def self.claim_attempt(reminder:, actor:, at:)
        ApplicationRecord.transaction do
          reminder.lock!
          outbox = reminder.outbox
          outbox.lock!

          return { reminder: reminder } if terminal?(reminder) || %w[accepted delivered unknown suppressed].include?(outbox.dispatch_state)
          return { reminder: reminder } if active_lease?(outbox, at)
          return { reminder: reminder } if recover_expired_lease!(reminder:, outbox:, actor:, at:)

          latest_attempt = reminder.delivery_attempts.order(attempt_number: :desc).first
          return { reminder: reminder } unless dispatchable?(reminder:, outbox:, latest_attempt:)

          decision = Policy.evaluate(reminder: reminder, at: at)
          unless decision[:allowed]
            apply_policy_denial!(reminder:, outbox:, actor:, decision:)
            return { reminder: reminder }
          end

          attempt = reusable_gated_attempt(latest_attempt, outbox)
          if attempt
            attempt.update_columns(status: "queued", failure_class: nil, retryable: false, completed_at: nil, updated_at: at)
          else
            attempt_number = latest_attempt&.attempt_number.to_i + 1
            if attempt_number > MAX_ATTEMPTS
              exhaust_retries!(reminder:, outbox:, actor:)
              return { reminder: reminder }
            end
            attempt = reminder.delivery_attempts.create!(
              practice: reminder.practice,
              attempt_number: attempt_number,
              provider: "synthetic",
              idempotency_key: "#{outbox.idempotency_key}:#{attempt_number}",
              status: "queued",
              masked_destination: reminder.communication_endpoint.masked_value,
              queued_at: at
            )
          end

          reminder.update!(status: "sending", policy_decision_code: "eligible", policy_version: decision[:version])
          outbox.update!(dispatch_state: "leased", lease_until: at + LEASE_DURATION)
          AuditRecorder.record!(
            practice: reminder.practice,
            actor: actor,
            action_code: "reminders.dispatch.claimed",
            outcome: :committed,
            resource_version_ref: "patient-reminder-attempt:#{attempt.id}"
          )
          { reminder: reminder, attempt: attempt }
        end
      end
      private_class_method :claim_attempt

      def self.ready_to_send?(reminder:, attempt:, actor:, at:)
        ApplicationRecord.transaction do
          reminder.lock!
          outbox = reminder.outbox
          outbox.lock!
          attempt.reload

          if terminal?(reminder)
            abandon_claim!(attempt:, outbox:, status: "cancelled", failure_class: "reminder_cancelled", at:)
            return false
          end

          unless outbox.dispatch_state == "leased" && attempt.status == "queued" &&
              reminder.delivery_attempts.order(attempt_number: :desc).first&.id == attempt.id
            return false
          end

          decision = Policy.evaluate(reminder: reminder, at: at)
          unless decision[:allowed]
            abandon_claim!(attempt:, outbox:, status: "suppressed", failure_class: decision[:code], at:)
            apply_policy_denial!(reminder:, outbox:, actor:, decision:)
            return false
          end

          reminder.update!(policy_decision_code: "eligible", policy_version: decision[:version])
          true
        end
      end
      private_class_method :ready_to_send?

      def self.deliver(reminder:, attempt:)
        Providers::Synthetic.send(reminder: reminder, idempotency_key: attempt.idempotency_key)
      rescue StandardError
        { status: :unknown, failure_class: "provider_outcome_unknown" }
      end
      private_class_method :deliver

      def self.finalize(reminder:, attempt:, actor:, result:, at:)
        ApplicationRecord.transaction do
          reminder.lock!
          outbox = reminder.outbox
          outbox.lock!
          attempt.reload

          case result.fetch(:status)
          when :accepted
            attempt.update_columns(
              status: "accepted", accepted_at: at, provider_message_id: result[:provider_message_id],
              retryable: false, completed_at: at, updated_at: at
            )
            outbox.update!(dispatch_state: "accepted", provider_message_id: result[:provider_message_id], lease_until: nil)
            reminder.update!(status: "provider_accepted") unless terminal?(reminder)
          when :outage
            attempt.update_columns(
              status: "failed", failure_class: "provider_outage", retryable: true,
              completed_at: at, updated_at: at
            )
            outbox.update!(dispatch_state: "failed", available_at: at + RETRY_DELAY, lease_until: nil)
            reminder.update!(status: "failed", policy_decision_code: "provider_outage") unless terminal?(reminder)
          when :gated
            attempt.update_columns(
              status: "gated", failure_class: "provider_gated", retryable: false,
              completed_at: at, updated_at: at
            )
            outbox.update!(dispatch_state: "pending", lease_until: nil)
            reminder.update!(status: "queued", policy_decision_code: "provider_gated") unless terminal?(reminder)
          else
            attempt.update_columns(
              status: "unknown", failure_class: result[:failure_class] || "provider_outcome_unknown",
              retryable: false, completed_at: at, updated_at: at
            )
            outbox.update!(dispatch_state: "unknown", lease_until: nil)
            reminder.update!(status: "delivery_unknown", policy_decision_code: "provider_outcome_unknown") unless terminal?(reminder)
          end

          AuditRecorder.record!(
            practice: reminder.practice,
            actor: actor,
            action_code: "reminders.dispatch.#{attempt.status}",
            outcome: :committed,
            resource_version_ref: "patient-reminder-attempt:#{attempt.id}"
          )
          reminder
        end
      end
      private_class_method :finalize

      def self.recover_expired_lease!(reminder:, outbox:, actor:, at:)
        return false unless outbox.dispatch_state == "leased" && outbox.lease_until.present? && outbox.lease_until <= at

        attempt = reminder.delivery_attempts.order(attempt_number: :desc).first
        if attempt&.status == "failed" && attempt.retryable?
          outbox.update!(dispatch_state: "failed", lease_until: nil)
          reminder.update!(status: "failed", policy_decision_code: attempt.failure_class) unless terminal?(reminder)
          return false
        end

        attempt&.update_columns(
          status: "unknown", failure_class: "dispatch_lease_expired", retryable: false,
          completed_at: at, updated_at: at
        )
        outbox.update!(dispatch_state: "unknown", lease_until: nil)
        reminder.update!(status: "delivery_unknown", policy_decision_code: "dispatch_lease_expired") unless terminal?(reminder)
        AuditRecorder.record!(
          practice: reminder.practice,
          actor: actor,
          action_code: "reminders.dispatch.delivery_unknown",
          outcome: :committed,
          resource_version_ref: "patient-reminder-attempt:#{attempt&.id || 'missing'}:expired-lease"
        )
        true
      end
      private_class_method :recover_expired_lease!

      def self.dispatchable?(reminder:, outbox:, latest_attempt:)
        return true if reminder.status == "scheduled" && outbox.dispatch_state == "pending" && latest_attempt.nil?
        return true if reminder.status == "failed" && outbox.dispatch_state == "failed" && latest_attempt&.status == "failed" && latest_attempt.retryable?
        reminder.status == "queued" && outbox.dispatch_state == "pending" && latest_attempt&.status == "gated"
      end
      private_class_method :dispatchable?

      def self.reusable_gated_attempt(latest_attempt, outbox)
        latest_attempt if outbox.dispatch_state == "pending" && latest_attempt&.status == "gated"
      end
      private_class_method :reusable_gated_attempt

      def self.active_lease?(outbox, at)
        outbox.dispatch_state == "leased" && outbox.lease_until.present? && outbox.lease_until > at
      end
      private_class_method :active_lease?

      def self.terminal?(reminder)
        reminder.cancelled_at.present? || TERMINAL_STATUSES.include?(reminder.status)
      end
      private_class_method :terminal?

      def self.apply_policy_denial!(reminder:, outbox:, actor:, decision:)
        target = decision[:code] == "expired" ? "expired" : "suppressed"
        reminder.update!(status: target, policy_decision_code: decision[:code], policy_version: decision[:version])
        outbox.update!(dispatch_state: "suppressed", lease_until: nil)
        AuditRecorder.record!(
          practice: reminder.practice,
          actor: actor,
          action_code: "reminders.suppressed",
          outcome: :committed,
          resource_version_ref: "patient-reminder:#{reminder.id}:#{decision[:code]}"
        )
      end
      private_class_method :apply_policy_denial!

      def self.exhaust_retries!(reminder:, outbox:, actor:)
        reminder.update!(status: "failed", policy_decision_code: "retry_limit_reached", policy_version: Policy::VERSION)
        outbox.update!(dispatch_state: "suppressed", lease_until: nil)
        AuditRecorder.record!(
          practice: reminder.practice,
          actor: actor,
          action_code: "reminders.dispatch.retry_exhausted",
          outcome: :committed,
          resource_version_ref: "patient-reminder:#{reminder.id}:retry-limit"
        )
      end
      private_class_method :exhaust_retries!

      def self.abandon_claim!(attempt:, outbox:, status:, failure_class:, at:)
        attempt.update_columns(
          status: status, failure_class: failure_class, retryable: false,
          completed_at: at, updated_at: at
        )
        outbox.update!(lease_until: nil)
      end
      private_class_method :abandon_claim!
    end
  end
end
