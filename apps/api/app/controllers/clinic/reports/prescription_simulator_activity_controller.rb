module Clinic
  module Reports
    class PrescriptionSimulatorActivityController < Clinic::ApiController
      def show
        render json: { report: PrescriptionSimulatorActivity.call(practice: current_practice, actor: current_user) }
      end
    end
  end
end
