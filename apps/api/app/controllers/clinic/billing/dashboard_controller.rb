module Clinic
  module Billing
    class DashboardController < Clinic::ApiController
      before_action -> { require_capability("billing.read") }

      def show
        render json: Dashboard.call(practice: current_practice)
      end
    end
  end
end
