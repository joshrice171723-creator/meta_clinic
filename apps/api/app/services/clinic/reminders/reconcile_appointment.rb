module Clinic
  module Reminders
    class ReconcileAppointment
      def self.call(appointment:, actor:)
        reminders = Clinic::PatientReminder.where(practice_id: appointment.practice_id, source_type: "Clinic::Appointment", source_id: appointment.id).active
        reminders.find_each do |reminder|
          if appointment.status == "cancelled"
            reminder.update!(status: "cancelled", cancelled_at: Current.business_time, cancel_reason: "source_appointment_cancelled")
            reminder.outbox.update!(dispatch_state: "suppressed")
          elsif appointment.saved_change_to_starts_at?
            scheduled = appointment.starts_at - 72.hours
            reminder.update!(scheduled_at: scheduled, local_schedule_label: scheduled.in_time_zone(reminder.timezone).strftime("%b %-d, %Y at %-I:%M %p %Z"), source_version: appointment.updated_at.utc.iso8601)
            reminder.outbox.update!(available_at: scheduled)
          end
          AuditRecorder.record!(practice: appointment.practice, actor: actor, action_code: "reminders.reconcile", outcome: :committed,
            resource_version_ref: "patient-reminder:#{reminder.id}")
        end
      end
    end
  end
end
