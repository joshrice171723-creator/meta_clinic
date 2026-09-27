module Clinic
  module Reports
    class ScribeActivityController < Clinic::ApiController
      def show
        render json: { report: ScribeActivity.call(practice: current_practice, actor: current_user) }
      end
    end
  end
end
