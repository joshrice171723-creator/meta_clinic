module Clinic
  module PatientPortal
    class AppointmentConfirmationsController < BaseController
      rescue_from AppointmentConfirmation::ReloadRequired do |error|
        render json: { error: error.message, code: "reload_required" }, status: :conflict
      end
      rescue_from AppointmentConfirmation::Stale do |error|
        render json: { error: error.message, code: "stale_record" }, status: :conflict
      end
      rescue_from Clinic::Authorization::Denied do
        render json: { error: "This patient portal account cannot confirm that appointment." }, status: :forbidden
      end

      def update
        input = parameter_hash!(:confirmation, %i[version])
        version = required_string!(input[:version], field: :version, maximum: 80)
        appointment = portal_patient.appointments.includes(*AppointmentRequestsController::APPOINTMENT_INCLUDES)
          .find(integer_id!(params[:appointment_id], field: :appointment_id))

        AppointmentConfirmation.confirm(
          practice: portal_practice,
          patient: portal_patient,
          appointment: appointment,
          actor: current_user,
          identity: patient_portal_identity,
          omni_preview: development_omni_preview?,
          version: version
        )
        render json: {
          appointment: AppointmentConfirmation.portal_appointment(
            appointment,
            pending_change: false
          )
        }
      end
    end
  end
end
