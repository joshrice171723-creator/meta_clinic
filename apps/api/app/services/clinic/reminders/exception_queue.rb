module Clinic
  module Reminders
    class ExceptionQueue
      ACTION_SOURCE_ID_SQL = <<~SQL.squish.freeze
        (SELECT reminder_action.id
          FROM clinic_patient_reminder_actions reminder_action
          WHERE reminder_action.practice_id = clinic_patient_reminders.practice_id
            AND reminder_action.reminder_id = clinic_patient_reminders.id
            AND reminder_action.action_type IN ('request_help', 'request_reschedule')
            AND reminder_action.outcome = 'recorded'
          ORDER BY reminder_action.created_at DESC, reminder_action.id DESC
          LIMIT 1)
      SQL

      DELIVERY_SOURCE_ID_SQL = <<~SQL.squish.freeze
        (SELECT delivery_attempt.id
          FROM clinic_patient_reminder_delivery_attempts delivery_attempt
          WHERE delivery_attempt.practice_id = clinic_patient_reminders.practice_id
            AND delivery_attempt.reminder_id = clinic_patient_reminders.id
          ORDER BY delivery_attempt.attempt_number DESC
          LIMIT 1)
      SQL

      DELIVERY_SOURCE_ELIGIBLE_SQL = <<~SQL.squish.freeze
        EXISTS (SELECT 1
          FROM clinic_patient_reminder_delivery_attempts delivery_attempt
          WHERE delivery_attempt.practice_id = clinic_patient_reminders.practice_id
            AND delivery_attempt.reminder_id = clinic_patient_reminders.id
            AND delivery_attempt.id = #{DELIVERY_SOURCE_ID_SQL}
            AND (
              (clinic_patient_reminders.policy_decision_code = 'retry_limit_reached' AND delivery_attempt.status = 'failed') OR
              (clinic_patient_reminders.status = 'delivery_unknown' AND delivery_attempt.status = 'unknown') OR
              (clinic_patient_reminders.status = 'failed' AND delivery_attempt.status = 'failed')
            ))
      SQL

      CURRENT_SOURCE_KEY_SQL = <<~SQL.squish.freeze
        CASE
          WHEN #{ACTION_SOURCE_ID_SQL} IS NOT NULL
            THEN 'reminder-handoff:action:' || (#{ACTION_SOURCE_ID_SQL})::text
          ELSE 'reminder-handoff:delivery:' || (#{DELIVERY_SOURCE_ID_SQL})::text
        END
      SQL

      EXCEPTION_SQL = <<~SQL.squish.freeze
        (
          #{ACTION_SOURCE_ID_SQL} IS NOT NULL OR
          (#{ACTION_SOURCE_ID_SQL} IS NULL AND #{DELIVERY_SOURCE_ELIGIBLE_SQL})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM clinic_operation_receipts handoff_receipt
          INNER JOIN clinic_staff_messages handoff_message
            ON handoff_message.practice_id = handoff_receipt.practice_id
            AND handoff_message.id = handoff_receipt.resource_id
          INNER JOIN clinic_staff_message_requests handoff_request
            ON handoff_request.practice_id = handoff_message.practice_id
            AND handoff_request.message_id = handoff_message.id
          WHERE handoff_receipt.practice_id = clinic_patient_reminders.practice_id
            AND handoff_receipt.operation_code = 'reminders.staff_handoff.create'
            AND handoff_receipt.outcome = 'committed'
            AND handoff_receipt.resource_type = 'Clinic::StaffMessage'
            AND handoff_receipt.request_key = #{CURRENT_SOURCE_KEY_SQL}
            AND handoff_message.linked_object_type = 'patient_reminder'
            AND handoff_message.linked_object_id = clinic_patient_reminders.id
            AND handoff_request.state = 'resolved'
        )
      SQL

      def self.call(scope:)
        scope.where(EXCEPTION_SQL)
      end
    end
  end
end
