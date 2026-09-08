module Clinic
  module PatientPortal
    class RecoveryController < ApplicationController
      include Clinic::Api::RequestParameters
      before_action :require_synthetic_portal

      def create
        parameter_hash!(:patient_portal_recovery, %i[contact])
        render json: { error: "Self-service recovery is not enabled. Contact the clinic support team.", code: "recovery_unavailable" }, status: :service_unavailable
      end

      private

      def require_synthetic_portal
        head :not_found unless Rails.env.test? || DevelopmentAccess.allowed?(request)
      end
    end
  end
end
