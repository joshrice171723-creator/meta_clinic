module Clinic
  module Scheduling
    class CreateEncounter
      def self.call(practice:, actor:, patient:, started_at: Current.business_time, appointment: nil, site: nil, room: nil)
        Authorization.authorize!(actor: actor, practice: practice, action: "encounters.write", site: site)
        raise ArgumentError, "The patient must belong to the selected practice." unless patient.practice_id == practice.id
        if appointment && (appointment.practice_id != practice.id || appointment.patient_id != patient.id)
          raise ArgumentError, "The appointment must belong to the selected patient and practice."
        end
        raise ArgumentError, "Cancelled appointments cannot start an encounter." if appointment&.status == "cancelled"

        practice.encounters.create!(
          patient: patient,
          appointment: appointment,
          site: site,
          room: room,
          started_at: started_at,
          status: "open"
        )
      rescue ActiveRecord::RecordNotUnique
        raise ArgumentError, "That appointment already has an encounter."
      end
    end
  end
end
