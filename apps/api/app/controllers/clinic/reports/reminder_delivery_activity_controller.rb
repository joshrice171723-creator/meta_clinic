module Clinic
  module Reports
    class ReminderDeliveryActivityController < Clinic::ApiController
      def show
        render json: { report: ReminderDeliveryActivity.call(practice: current_practice, actor: current_user) }
      end
    end
  end
end
