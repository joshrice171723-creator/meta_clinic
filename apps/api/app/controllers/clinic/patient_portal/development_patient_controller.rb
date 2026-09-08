module Clinic
  module PatientPortal
    class DevelopmentPatientController < BaseController
      before_action :require_omni_preview

      def update
        patient = development_omni_preview_patients.find(integer_id!(params[:patient_id], field: :patient_id))
        session[:patient_portal_preview_patient_id] = patient.id
        Clinic::AuditRecorder.record!(practice: portal_practice, actor: current_user,
          action_code: "patient_portal.development_preview.switch", outcome: :committed,
          resource_version_ref: "patient_portal_preview:#{patient.id}")
        render json: { selected_patient: patient_payload(patient) }
      end

      private

      def require_omni_preview
        return if development_omni_preview?

        head :not_found
      end

      def patient_payload(patient)
        { id: patient.id, display_name: patient.display_name, reference: patient.reference }
      end
    end
  end
end
