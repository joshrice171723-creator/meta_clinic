module Clinic
  module Reminders
    class ReconcileAppointment
      def self.call(appointment:, actor:)
        reminders = Clinic::PatientReminder.where(practice_id: appointment.practice_id, source_type: "Clinic::Appointment", source_id: appointment.id).active
        reminders.find_each do |reminder|
          reminder.with_lock do
            outbox = reminder.outbox
            outbox.lock!
            # Preserve actual provider outcomes; a changed appointment cannot recall a delivered message.
            next if %w[provider_accepted delivered actioned delivery_unknown].include?(reminder.status)
            if reminder.status == "sending" || outbox.dispatch_state == "leased"
              if appointment.saved_change_to_starts_at?
                raise ArgumentError, "An appointment reminder is in progress. Reconcile its delivery before rescheduling."
              end
              next
            end

            cancelled = appointment.status == "cancelled"
            finished = %w[completed no_show].include?(appointment.status) && %w[appointment preparation].include?(reminder.category)
            moved = appointment.saved_change_to_starts_at?
            next unless cancelled || finished || moved

            if cancelled || finished || (moved && reminder.safe_content_version == "custom-v1")
              reason = moved ? "source_appointment_rescheduled" : "source_appointment_#{appointment.status}"
              reminder.update!(status: "cancelled", cancelled_at: Current.business_time, cancel_reason: reason)
              outbox.update!(dispatch_state: "suppressed", lease_until: nil)
            elsif moved
              old_start, new_start = appointment.saved_change_to_starts_at
              offset = new_start - old_start
              scheduled = reminder.scheduled_at + offset
              reminder.update!(scheduled_at: scheduled, expires_at: reminder.expires_at && reminder.expires_at + offset,
                local_schedule_label: scheduled.in_time_zone(reminder.timezone).strftime("%b %-d, %Y at %-I:%M %p %Z"),
                source_version: appointment.updated_at.utc.iso8601)
              outbox.update!(available_at: scheduled)
            end
            AuditRecorder.record!(practice: appointment.practice, actor: actor, action_code: "reminders.reconcile", outcome: :committed,
              resource_version_ref: "patient-reminder:#{reminder.id}")
          end
        end
      end
    end
  end
end
