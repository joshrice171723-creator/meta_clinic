module Clinic
  module Scheduling
    class TransitionAppointment
      def self.call(appointment:, actor:, to:, site: nil, expected_status: nil)
        appointment.with_lock do
          raise ArgumentError, "The appointment belongs to a different site." if site && site.id != appointment.site_id

          Authorization.authorize_with_legacy!(actor: actor, practice: appointment.practice,
            action: "appointments.status_transition", legacy_action: "appointments.write", site: appointment.site)
          if expected_status.present? && appointment.status != expected_status
            raise ActiveRecord::StaleObjectError.new(appointment, "transition")
          end
          if %w[cancelled no_show].include?(to.to_s) && appointment.encounter.present?
            raise ArgumentError, "A visit has already started. Review the encounter before changing the appointment."
          end
          if to.to_s == "completed" && appointment.encounter && appointment.encounter.ended_at.nil?
            raise ArgumentError, "Complete the encounter before completing its appointment."
          end

          appointment.transition_to!(to)
          Clinic::Reminders::ReconcileAppointment.call(appointment: appointment, actor: actor)
          appointment
        end
      end
    end
  end
end
