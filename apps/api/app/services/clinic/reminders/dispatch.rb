module Clinic
  module Reminders
    class Dispatch
      MAX_ATTEMPTS = 3
      LEASE_DURATION = 5.minutes
      RETRY_DELAY = 5.minutes
      TERMINAL_STATUSES = %w[cancelled expired suppressed actioned delivered].freeze

      def self.call(reminder:, actor:, at: Current.business_time)
        Authorization.authorize!(actor: actor, practice: reminder.practice, action: "reminders.write", at: at)
        claim = claim_attempt(reminder:, actor:, at:)
        return claim.fetch(:reminder) unless claim[:attempt]

        attempt = claim.fetch(:attempt)
        send_at = Current.business_time
        return reminder.reload unless ready_to_send?(reminder:, attempt:, actor:, at: send_at)

        result = deliver(reminder:, attempt:)
        finalize(reminder:, attempt:, actor:, result:, at: Current.business_time)
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
          return { reminder: reminder } unless dispatchable?(reminder:, outbox:, latest_attempt:, at:)

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
              provider: provider_name,
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
        authorized = Authorization.allowed?(
          actor: actor,
          practice: reminder.practice,
          action: "reminders.write",
          at: at
        )

        ApplicationRecord.transaction do
          reminder.lock!
          outbox = reminder.outbox
          outbox.lock!
          attempt.reload

          unless authorized
            stop_claim!(
              reminder:, attempt:, outbox:, attempt_status: "suppressed",
              reminder_status: "failed", outbox_state: "suppressed",
              failure_class: "actor_authority_unavailable", at:
            )
            return false
          end

          if reminder.status == "paused"
            stop_claim!(
              reminder:, attempt:, outbox:, attempt_status: "suppressed",
              reminder_status: "paused", outbox_state: "pending",
              failure_class: "reminder_paused", at:
            )
            return false
          end

          if reminder.cancelled_at.present? || %w[cancelled suppressed expired].include?(reminder.status)
            cancelled_status = reminder.cancelled_at.present? ? "cancelled" : reminder.status
            stop_claim!(
              reminder:, attempt:, outbox:, attempt_status: "cancelled",
              reminder_status: cancelled_status, outbox_state: "suppressed",
              failure_class: "reminder_cancelled", at:
            )
            return false
          end

          if %w[delivered actioned].include?(reminder.status)
            return false
          end

          unless outbox.dispatch_state == "leased" && attempt.status == "queued" &&
              reminder.delivery_attempts.order(attempt_number: :desc).first&.id == attempt.id
            return false
          end

          decision = Policy.evaluate(reminder: reminder, at: at)
          unless decision[:allowed]
            attempt.update_columns(
              status: "suppressed", failure_class: decision[:code], retryable: false,
              completed_at: at, updated_at: at
            )
            apply_policy_denial!(reminder:, outbox:, actor:, decision:)
            return false
          end

          reminder.update!(policy_decision_code: "eligible", policy_version: decision[:version])
          true
        end
      end
      private_class_method :ready_to_send?

      def self.deliver(reminder:, attempt:)
        provider.send(reminder: reminder, idempotency_key: attempt.idempotency_key)
      rescue StandardError
        { status: :unknown, failure_class: "provider_outcome_unknown" }
      end
      private_class_method :deliver

      def self.provider
        case provider_name
        when "twilio" then Providers::Twilio
        when "twilio_test" then Providers::TwilioTest
        else Providers::Synthetic
        end
      end
      private_class_method :provider

      def self.provider_name
        configured = ENV["APPLY_REMINDERS_PROVIDER"].to_s
        return "twilio" if configured == "twilio"
        return "twilio_test" if configured == "twilio_test"

        "synthetic"
      end
      private_class_method :provider_name

      def self.finalize(reminder:, attempt:, actor:, result:, at:)
        ApplicationRecord.transaction do
          reminder.lock!
          outbox = reminder.outbox
          outbox.lock!
          attempt.reload

          latest_attempt = reminder.delivery_attempts.order(attempt_number: :desc).first
          return reminder unless latest_attempt&.id == attempt.id
          if reminder.cancelled_at.present? || %w[cancelled suppressed expired].include?(reminder.status)
            if attempt.status == "queued"
              finalize_attempt_only!(attempt:, result:, at:)
              AuditRecorder.record!(
                practice: reminder.practice,
                actor: actor,
                action_code: "reminders.dispatch.#{attempt.status}",
                outcome: :committed,
                resource_version_ref: "patient-reminder-attempt:#{attempt.id}"
              )
            end
            return reminder
          end
          return reminder if final_state_must_be_preserved?(reminder:, outbox:, attempt:)

          late_acceptance = result.fetch(:status) == :accepted &&
            attempt.delivery_uncertain? && attempt.failure_class == "dispatch_lease_expired" &&
            reminder.status == "delivery_unknown" && outbox.dispatch_state == "unknown"
          normal_completion = attempt.status == "queued" && outbox.dispatch_state == "leased"
          paused_completion = reminder.status == "paused" && attempt.status == "queued" &&
            %w[leased pending].include?(outbox.dispatch_state)
          return reminder unless normal_completion || paused_completion || late_acceptance

          case result.fetch(:status)
          when :accepted
            attempt.update_columns(
              status: "accepted", accepted_at: at, provider_message_id: result[:provider_message_id],
              retryable: false, completed_at: at, updated_at: at
            )
            outbox.update!(dispatch_state: "accepted", provider_message_id: result[:provider_message_id], lease_until: nil)
            reminder.update!(status: "provider_accepted") unless preserve_reminder_status?(reminder)
          when :outage
            attempt.update_columns(
              status: "failed", failure_class: "provider_outage", retryable: true,
              completed_at: at, updated_at: at
            )
            outbox.update!(dispatch_state: "failed", available_at: at + RETRY_DELAY, lease_until: nil)
            reminder.update!(status: "failed", policy_decision_code: "provider_outage") unless preserve_reminder_status?(reminder)
          when :gated
            attempt.update_columns(
              status: "gated", failure_class: "provider_gated", retryable: false,
              completed_at: at, updated_at: at
            )
            outbox.update!(dispatch_state: "pending", lease_until: nil)
            reminder.update!(status: "queued", policy_decision_code: "provider_gated") unless preserve_reminder_status?(reminder)
          else
            attempt.update_columns(
              status: "unknown", failure_class: result[:failure_class] || "provider_outcome_unknown",
              retryable: false, completed_at: at, updated_at: at
            )
            outbox.update!(dispatch_state: "unknown", lease_until: nil)
            reminder.update!(status: "delivery_unknown", policy_decision_code: "provider_outcome_unknown") unless preserve_reminder_status?(reminder)
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

      def self.dispatchable?(reminder:, outbox:, latest_attempt:, at:)
        return false if outbox.available_at > at
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

      def self.final_state_must_be_preserved?(reminder:, outbox:, attempt:)
        return true if %w[delivered actioned].include?(reminder.status)
        return true if %w[delivered suppressed].include?(outbox.dispatch_state)

        %w[accepted delivered failed suppressed cancelled].include?(attempt.status)
      end
      private_class_method :final_state_must_be_preserved?

      def self.preserve_reminder_status?(reminder)
        reminder.status == "paused" || terminal?(reminder)
      end
      private_class_method :preserve_reminder_status?

      def self.finalize_attempt_only!(attempt:, result:, at:)
        attributes = case result.fetch(:status)
        when :accepted
          {
            status: "accepted", accepted_at: at, provider_message_id: result[:provider_message_id],
            failure_class: nil, retryable: false
          }
        when :outage
          { status: "failed", failure_class: "provider_outage", retryable: false }
        when :gated
          { status: "gated", failure_class: "provider_gated", retryable: false }
        else
          {
            status: "unknown", failure_class: result[:failure_class] || "provider_outcome_unknown",
            retryable: false
          }
        end
        attempt.update_columns(**attributes, completed_at: at, updated_at: at)
      end
      private_class_method :finalize_attempt_only!

      def self.stop_claim!(reminder:, attempt:, outbox:, attempt_status:, reminder_status:, outbox_state:, failure_class:, at:)
        attempt.update_columns(
          status: attempt_status, failure_class: failure_class, retryable: false,
          completed_at: at, updated_at: at
        )
        outbox.update!(dispatch_state: outbox_state, lease_until: nil)
        reminder.update!(status: reminder_status, policy_decision_code: failure_class)
      end
      private_class_method :stop_claim!
    end
  end
end
