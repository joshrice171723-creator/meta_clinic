module Clinic
  module PatientReminderSerializer
    def self.call(reminder, detail: false, actor: nil, staff_handoff: nil, include_content: false, appointment: nil)
      payload = {
        id: reminder.id, patient_id: reminder.patient_id, category: reminder.category,
        channel: reminder.channel, safe_preview: reminder.safe_preview, scheduled_at: reminder.scheduled_at&.iso8601(6),
        timezone: reminder.timezone, local_schedule_label: reminder.local_schedule_label, status: reminder.status,
        priority: reminder.priority, expires_at: reminder.expires_at&.iso8601(6), created_at: reminder.created_at&.iso8601(6),
        patient: { id: reminder.patient.id, display_name: reminder.patient.display_name, reference: reminder.patient.reference },
        endpoint: { type: reminder.communication_endpoint.endpoint_type, label: reminder.communication_endpoint.label,
          masked_value: reminder.communication_endpoint.masked_value },
        action_types: %w[confirm request_reschedule request_help dismiss],
        staff_handoff: staff_handoff || Clinic::Reminders::StaffHandoff.summary(reminder: reminder, actor: actor)
      }
      payload[:content] = reminder.content if include_content
      if appointment
        payload[:appointment] = {
          id: appointment.id, starts_at: appointment.starts_at&.iso8601(6), ends_at: appointment.ends_at&.iso8601(6),
          status: appointment.status, site_id: appointment.site_id
        }
      end
      if detail
        payload[:source] = { type: reminder.source_type, id: reminder.source_id, version: reminder.source_version }
        payload[:policy] = { code: reminder.policy_decision_code, version: reminder.policy_version }
        payload[:delivery_attempts] = reminder.delivery_attempts.order(attempt_number: :asc).map do |attempt|
          { attempt_number: attempt.attempt_number, status: attempt.status, failure_class: attempt.failure_class,
            retryable: attempt.retryable, provider: attempt.provider, masked_destination: attempt.masked_destination,
            queued_at: attempt.queued_at&.iso8601(6), accepted_at: attempt.accepted_at&.iso8601(6), completed_at: attempt.completed_at&.iso8601(6) }
        end
      end
      payload
    end
  end
end
