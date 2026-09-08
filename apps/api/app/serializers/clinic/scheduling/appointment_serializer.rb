module Clinic
  module Scheduling
    module AppointmentSerializer
      def self.call(appointment, actor: nil)
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
          room_code: appointment.room&.code,
          booked_clinician_id: appointment.booked_clinician_id,
          visit_type_id: appointment.visit_type_id,
          starts_at: appointment.starts_at&.iso8601(6),
          ends_at: appointment.ends_at&.iso8601(6),
          status: appointment.status,
          visit_modality: appointment.visit_modality,
          telehealth: telehealth(appointment.telehealth_visit, actor: actor),
          updated_at: appointment.updated_at&.iso8601(6),
          encounter_id: appointment.encounter&.id,
          encounter_status: appointment.encounter&.status,
          encounter_started_at: appointment.encounter&.started_at&.iso8601(6),
          encounter_ended_at: appointment.encounter&.ended_at&.iso8601(6)
        }
      end

      def self.telehealth(visit, actor:)
        Clinic::Telehealth::SummarySerializer.call(visit, actor: actor)&.slice(
          :public_id, :status, :prepare_href, :clinic_href
        )
      end
    end
  end
end
