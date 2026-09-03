module Clinic
  module Billing
    class PatientLedgersController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.read", "patients.read") }

      def show
        patient = current_practice.patients.find(requested_id!(params[:id], :id))
        render json: PatientLedger.call(practice: current_practice, patient: patient)
      end
    end
  end
end
