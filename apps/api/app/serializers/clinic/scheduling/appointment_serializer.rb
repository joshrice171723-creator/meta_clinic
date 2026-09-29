module Clinic
  module Scheduling
    module AppointmentSerializer
      def self.call(appointment, actor: nil)
        setup_missing = Clinic::Scheduling::TransitionAppointment.setup_missing(appointment)
        {
          id: appointment.id,
          patient_id: appointment.patient_id,
          patient: {
            id: appointment.patient.id,
            display_name: appointment.patient.display_name,
            reference: appointment.patient.reference,
            phone: patient_phone(appointment.patient)
          },
          site_id: appointment.site_id,
          room_id: appointment.room_id,
          room_code: appointment.room&.code,
          booked_clinician_id: appointment.booked_clinician_id,
          visit_type_id: appointment.visit_type_id,
          service_offering_id: appointment.service_offering_id,
          schedule_hold_id: appointment.schedule_hold_id,
          service_offering_snapshot: appointment.service_offering_snapshot,
          reason: appointment.reason,
          starts_at: appointment.starts_at&.iso8601(6),
          ends_at: appointment.ends_at&.iso8601(6),
          status: appointment.status,
          visit_modality: appointment.visit_modality,
          walk_in: appointment.walk_in_exception.present?,
          capacity_override_reason: appointment.walk_in_exception&.reason,
          overbooked: appointment.overbook_exception.present?,
          overbook_reason: appointment.overbook_exception&.reason,
          series_id: appointment.series_occurrence&.series_id,
          series_sequence: appointment.series_occurrence&.sequence,
          telehealth: telehealth(appointment.telehealth_visit, actor: actor),
          updated_at: appointment.updated_at&.iso8601(6),
          encounter_id: appointment.encounter&.id,
          encounter_status: appointment.encounter&.status,
          encounter_started_at: appointment.encounter&.started_at&.iso8601(6),
          encounter_ended_at: appointment.encounter&.ended_at&.iso8601(6),
          needs_setup: setup_missing.any?,
          readiness: setup_missing.any? ? "needs_setup" : "ready",
          setup_missing: setup_missing.map(&:to_s)
        }
      end

      def self.telehealth(visit, actor:)
        Clinic::Telehealth::SummarySerializer.reference(visit)
      end

      def self.patient_phone(patient)
        if patient.association(:communication_endpoints).loaded?
          patient.communication_endpoints.find { |endpoint| endpoint.verified_at.present? && endpoint.invalidated_at.nil? && endpoint.phone? }&.value
        else
          patient.communication_endpoints.verified.phone.first&.value
        end
      end
      private_class_method :patient_phone
    end
  end
end
