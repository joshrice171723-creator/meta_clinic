module Clinic
  module Scheduling
    class TransitionAppointment
      def self.call(appointment:, actor:, to:, site: nil)
        Authorization.authorize_with_legacy!(actor: actor, practice: appointment.practice, action: "appointments.status_transition", legacy_action: "appointments.write", site: site || appointment.site)
        appointment.transition_to!(to)
      end
    end
  end
end
