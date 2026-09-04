module Clinic
  module PatientPortal
    class StepUpController < BaseController
      def create
        render json: { error: "Step-up authentication is not enabled for this synthetic portal. Contact the clinic support team.", code: "step_up_unavailable" }, status: :service_unavailable
      end
    end
  end
end
