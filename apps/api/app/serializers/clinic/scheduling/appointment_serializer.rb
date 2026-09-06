module Clinic
  module Scheduling
    module AppointmentSerializer
      def self.call(appointment)
        {
          id: appointment.id,
          patient_id: appointment.patient_id,
          patient: {
            id: appointment.patient.id,
            display_name: appointment.patient.display_name,
            reference: appointment.patient.reference,
            phone: appointment.patient.communication_endpoints.verified.phone.first&.value
          },
          site_id: appointment.site_id,
          room_id: appointment.room_id,
          booked_clinician_id: appointment.booked_clinician_id,
          visit_type_id: appointment.visit_type_id,
          starts_at: appointment.starts_at&.iso8601(6),
          ends_at: appointment.ends_at&.iso8601(6),
          status: appointment.status,
          encounter_id: appointment.encounter&.id
        }
      end
    end
  end
end
