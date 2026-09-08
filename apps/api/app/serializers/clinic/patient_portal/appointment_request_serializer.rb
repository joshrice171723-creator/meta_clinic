module Clinic
  module PatientPortal
    module AppointmentRequestSerializer
      module_function

      def call(request, include_patient: false)
        payload = {
          id: request.id,
          request_key: request.request_key,
          request_kind: request.request_kind,
          starts_at: request.starts_at&.iso8601(6),
          ends_at: request.ends_at&.iso8601(6),
          status: request.status,
          site: site(request.site),
          visit_type: visit_type(request.visit_type),
          requested_at: request.requested_at&.iso8601(6),
          reviewed_at: request.reviewed_at&.iso8601(6),
          source_appointment: source_appointment(request),
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
          updated_at: record.updated_at&.iso8601(6),
          site: site(record.site),
          room: record.room && { id: record.room.id, code: record.room.code },
          clinician: record.booked_clinician && {
            id: record.booked_clinician.id,
            display_name: record.booked_clinician.display_name.presence || "Provider name not recorded"
          },
          visit_type: visit_type(record.visit_type)
        }
      end

      def source_appointment(request)
        return if request.new_booking?

        {
          id: request.source_appointment_id,
          starts_at: request.source_starts_at&.iso8601(6),
          ends_at: request.source_ends_at&.iso8601(6),
          status: request.source_status,
          updated_at: request.source_appointment_updated_at&.iso8601(6),
          site: site(request.source_site)
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
