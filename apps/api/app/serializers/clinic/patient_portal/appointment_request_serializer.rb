module Clinic
  module PatientPortal
    module AppointmentRequestSerializer
      module_function

      def call(request, include_patient: false)
        payload = {
          id: request.id,
          request_key: request.request_key,
          starts_at: request.starts_at&.iso8601(6),
          ends_at: request.ends_at&.iso8601(6),
          status: request.status,
          site: site(request.site),
          visit_type: visit_type(request.visit_type),
          requested_at: request.requested_at&.iso8601(6),
          reviewed_at: request.reviewed_at&.iso8601(6),
          appointment: appointment(request.appointment)
        }
        if include_patient
          payload[:patient] = {
            id: request.patient.id,
            display_name: request.patient.display_name,
            reference: request.patient.reference
          }
          payload[:review_note] = request.review_note
        end
        payload
      end

      def appointment(record)
        return unless record

        {
          id: record.id,
          starts_at: record.starts_at&.iso8601(6),
          ends_at: record.ends_at&.iso8601(6),
          status: record.status,
          site: site(record.site),
          room: record.room && { id: record.room.id, code: record.room.code },
          clinician: record.booked_clinician && {
            id: record.booked_clinician.id,
            display_name: record.booked_clinician.display_name.presence || "Provider name not recorded"
          },
          visit_type: visit_type(record.visit_type)
        }
      end

      def site(record)
        record && { id: record.id, code: record.code, name: record.name }
      end

      def visit_type(record)
        record && { id: record.id, code: record.code }
      end
    end
  end
end
