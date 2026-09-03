module Clinic
  module PatientPortal
    class BaseController < ApplicationController
      include Clinic::Api::RequestParameters
      before_action :require_member
      before_action :require_development_patient
      before_action :require_portal_identity

      helper_method :patient_portal_identity, :portal_practice, :portal_patient

      private

      def require_development_patient
        return if Development::TestAccounts.patient?(current_user)

        render json: { error: "The patient portal is available only for its assigned synthetic account." }, status: :not_found
      end

      def require_portal_identity
        return if patient_portal_identity

        render json: { error: "No active patient portal access is assigned." }, status: :forbidden
      end

      def patient_portal_identity
        @patient_portal_identity ||= Clinic::PatientPortal::Identity.available
          .includes(:practice, :patient).find_by(user_id: current_user.id)
      end

      def portal_practice
        patient_portal_identity.practice
      end

      def portal_patient
        patient_portal_identity.patient
      end

      def record_portal_read(action_code)
        Clinic::AuditRecorder.record!(practice: portal_practice, actor: current_user,
          action_code: action_code, outcome: :released)
      end
    end
  end
end
