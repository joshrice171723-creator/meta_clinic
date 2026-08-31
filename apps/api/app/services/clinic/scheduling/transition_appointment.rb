module Clinic
  module Scheduling
    class TransitionAppointment
      def self.call(appointment:, actor:, to:, site: nil)
        Authorization.authorize!(actor: actor, practice: appointment.practice, action: "appointments.write", site: site || appointment.site)
        appointment.transition_to!(to)
      end
    end
  end
end
