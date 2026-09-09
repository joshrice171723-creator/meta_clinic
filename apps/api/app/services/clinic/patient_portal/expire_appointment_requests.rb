module Clinic
  module PatientPortal
    class ExpireAppointmentRequests
      def self.call(scope:, actor:, at: Current.business_time)
        scope.where(clinic_patient_portal_appointment_requests: { status: "pending" }).where(
          <<~SQL.squish,
            CASE clinic_patient_portal_appointment_requests.request_kind
            WHEN 'cancel' THEN clinic_patient_portal_appointment_requests.source_ends_at <= :at
            ELSE clinic_patient_portal_appointment_requests.ends_at <= :at
            END
          SQL
          at: at
        ).pluck("clinic_patient_portal_appointment_requests.id").each do |request_id|
          ApplicationRecord.transaction do
            request = AppointmentRequest.lock.find(request_id)
            next unless request.pending?
            deadline = request.cancel? ? request.source_ends_at : request.ends_at
            next unless deadline && deadline <= at

            request.update!(status: :expired)
            Clinic::AuditRecorder.record!(
              practice: request.practice,
              actor: actor,
              action_code: "patient_portal.appointment_request.expired",
              outcome: :committed,
              resource_version_ref: "patient_portal_appointment_request:#{request.id}:#{request.updated_at.utc.iso8601(6)}"
            )
          end
        end
      end
    end
  end
end
