module Clinic
  module Billing
    class DashboardController < Clinic::ApiController
      before_action :require_billing_read

      def show
        render json: Dashboard.call(practice: current_practice)
      end

      private

      def require_billing_read
        ability = Ability.new(current_user, practice: current_practice)
        return if ability.allowed_permission?("billing.read")
        return if ability.allowed_permission?("billing.write")

        require_capability("billing.read")
      end
    end
  end
end
