module Clinic
  module Scheduling
    class BookAppointment
      def self.call(practice:, actor:, patient:, starts_at:, ends_at:, site: nil, room: nil, booked_clinician: nil, visit_type: nil)
        Authorization.authorize!(actor: actor, practice: practice, action: "appointments.write", site: site)
        raise ArgumentError, "The patient must belong to the selected practice." unless patient.practice_id == practice.id

        appointment = practice.appointments.new(
          patient: patient,
          site: site,
          room: room,
          booked_clinician: booked_clinician,
          visit_type: visit_type,
          starts_at: starts_at,
          ends_at: ends_at,
          status: "scheduled"
        )
        appointment.save!
        appointment
      rescue ActiveRecord::StatementInvalid => error
        raise unless error.message.match?(/overlap|exclusion|no_provider|no_room/i)

        raise ArgumentError, "The selected room or clinician is already reserved for that interval."
      end
    end
  end
end
