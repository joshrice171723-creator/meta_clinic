module Clinic
  module Scheduling
    class CreateEncounter
      def self.call(practice:, actor:, patient:, started_at: Current.business_time, appointment: nil, site: nil, room: nil)
        raise ArgumentError, "The patient must belong to the selected practice." unless patient.practice_id == practice.id
        if appointment && (appointment.practice_id != practice.id || appointment.patient_id != patient.id)
          raise ArgumentError, "The appointment must belong to the selected patient and practice."
        end
        if appointment
          return appointment.with_lock do
            raise ArgumentError, "The selected site does not match the appointment." if site && site.id != appointment.site_id
            raise ArgumentError, "The selected room does not match the appointment." if room && room.id != appointment.room_id

            Authorization.authorize!(actor: actor, practice: practice, action: "encounters.write", site: appointment.site)
            existing = practice.encounters.find_by(appointment_id: appointment.id)
            next existing if existing
            unless %w[scheduled confirmed].include?(appointment.status)
              raise ArgumentError, "Only scheduled or confirmed appointments can start a visit."
            end

            encounter = practice.encounters.create!(patient: patient, appointment: appointment,
              site: appointment.site, room: appointment.room, started_at: started_at, status: "open")
            Clinic::Telehealth::ReconcileAppointment.bind_encounter!(appointment: appointment, encounter: encounter)
            encounter
          end
        end

        Authorization.authorize!(actor: actor, practice: practice, action: "encounters.write", site: site)

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
