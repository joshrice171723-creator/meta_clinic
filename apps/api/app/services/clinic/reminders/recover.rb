module Clinic
  module Reminders
    class Recover
      DEFAULT_LIMIT = 50
      MAX_LIMIT = 100

      def self.call(practice:, actor:, at: Current.business_time, limit: DEFAULT_LIMIT,
        outbox_ids: nil, lease_recovery_only: false)
        Authorization.authorize!(actor: actor, practice: practice, action: "reminders.write", at: at)
        limit = Integer(limit)
        raise ArgumentError, "Recovery limit must be between 1 and #{MAX_LIMIT}." unless limit.between?(1, MAX_LIMIT)

        counts = Hash.new(0)
        candidate_ids(practice:, at:, limit:, outbox_ids:, lease_recovery_only:).each do |outbox_id|
          outbox = practice.patient_reminder_outboxes.find_by(id: outbox_id)
          unless outbox
            counts[:skipped] += 1
            next
          end

          reminder = practice.patient_reminders.find_by(id: outbox.reminder_id)
          unless reminder
            counts[:skipped] += 1
            next
          end

          before, after = process_reminder(
            reminder: reminder, actor: actor, at: at, lease_recovery_only: lease_recovery_only
          )
          next unless before

          counts[classify(before, after)] += 1
        end

        {
          examined: counts.values.sum,
          dispatched: counts[:dispatched],
          delivery_unknown: counts[:delivery_unknown],
          retry_exhausted: counts[:retry_exhausted],
          suppressed: counts[:suppressed],
          unchanged: counts[:unchanged],
          skipped: counts[:skipped]
        }
      end

      def self.candidate_ids(practice:, at:, limit:, outbox_ids: nil, lease_recovery_only: false)
        relation = practice.patient_reminder_outboxes
          .joins(:reminder)
          .where(
            <<~SQL.squish,
              (clinic_patient_reminder_outbox.dispatch_state = 'leased' AND clinic_patient_reminder_outbox.lease_until <= :at)
              OR (clinic_patient_reminder_outbox.dispatch_state = 'failed' AND clinic_patient_reminder_outbox.available_at <= :at
                AND clinic_patient_reminders.status = 'failed')
              OR (clinic_patient_reminder_outbox.dispatch_state = 'pending' AND clinic_patient_reminder_outbox.available_at <= :at
                AND clinic_patient_reminders.status = 'scheduled')
            SQL
            at: at
          )
        relation = relation.where(id: Array(outbox_ids)) if outbox_ids
        relation = relation.where(dispatch_state: "leased") if lease_recovery_only
        relation.order(:available_at, :id)
          .limit(limit)
          .pluck(:id)
      end
      private_class_method :candidate_ids

      def self.process_reminder(reminder:, actor:, at:, lease_recovery_only:)
        unless lease_recovery_only
          before = snapshot(reminder)
          Dispatch.call(reminder: reminder, actor: actor, at: at)
          return [ before, snapshot(reminder.reload) ]
        end

        ApplicationRecord.transaction do
          reminder.lock!
          outbox = reminder.outbox
          outbox.lock!
          return [ nil, nil ] unless outbox.dispatch_state == "leased" &&
            outbox.lease_until.present? && outbox.lease_until <= at

          before = snapshot(reminder)
          Dispatch.call(reminder: reminder, actor: actor, at: at)
          [ before, snapshot(reminder.reload) ]
        end
      end
      private_class_method :process_reminder

      def self.snapshot(reminder)
        reminder.outbox.reload
        {
          attempts: reminder.delivery_attempts.count,
          outbox_state: reminder.outbox.dispatch_state,
          policy_code: reminder.policy_decision_code
        }
      end
      private_class_method :snapshot

      def self.classify(before, after)
        return :delivery_unknown if before[:outbox_state] != "unknown" && after[:outbox_state] == "unknown"
        return :retry_exhausted if after[:policy_code] == "retry_limit_reached"
        return :suppressed if before[:outbox_state] != "suppressed" && after[:outbox_state] == "suppressed"
        return :dispatched if after[:attempts] > before[:attempts] || after[:outbox_state] != before[:outbox_state]

        :unchanged
      end
      private_class_method :classify
    end
  end
end
