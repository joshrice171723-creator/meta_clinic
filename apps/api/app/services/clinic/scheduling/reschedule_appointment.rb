module Clinic
  module Scheduling
    class RescheduleAppointment
      def self.call(appointment:, actor:, starts_at:, ends_at:, expected_updated_at:, request_key:)
        authorize = -> {
          Authorization.authorize_with_legacy!(actor: actor, practice: appointment.practice,
            action: "appointments.book", legacy_action: "appointments.write", site: appointment.site)
        }
        authorize.call
        raise ArgumentError, "Choose an end time after the start time and within 24 hours." unless ends_at > starts_at && ends_at - starts_at <= 24.hours

        outcome = Clinic::Idempotency.execute(
          practice: appointment.practice, actor: actor, operation_code: "appointments.reschedule",
          request_key: request_key, resource: appointment, authorization: authorize,
          authorization_action: "appointments.book", result_resource: ->(record) { record },
          resource_resolver: ->(practice:, receipt:) { practice.appointments.find_by(id: receipt.resource_id) },
          payload: { appointment_id: appointment.id, starts_at: starts_at.iso8601(6), ends_at: ends_at.iso8601(6),
            expected_updated_at: expected_updated_at.iso8601(6) }
        ) do
          appointment.with_lock do
            authorize.call
            raise ActiveRecord::StaleObjectError.new(appointment, "reschedule") unless appointment.updated_at == expected_updated_at
            unless %w[scheduled confirmed].include?(appointment.status) && appointment.encounter.nil?
              raise ArgumentError, "Only an upcoming visit that has not started can be rescheduled."
            end

            appointment.update!(starts_at: starts_at, ends_at: ends_at)
            Clinic::Reminders::ReconcileAppointment.call(appointment: appointment, actor: actor)
            AuditRecorder.record!(practice: appointment.practice, actor: actor, action_code: "appointments.reschedule",
              outcome: :committed, resource_version_ref: "appointment:#{appointment.id}:#{appointment.updated_at.utc.iso8601(6)}")
            appointment
          end
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      rescue ActiveRecord::StatementInvalid => error
        raise unless error.message.match?(/overlap|exclusion|no_provider|no_room/i)

        raise ArgumentError, "The selected room or clinician is already reserved for that interval."
      end
    end
  end
end
