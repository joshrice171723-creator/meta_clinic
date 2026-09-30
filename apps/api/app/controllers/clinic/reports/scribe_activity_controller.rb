module Clinic
  module Reports
    class ScribeActivityController < Clinic::ApiController
      def show
        render json: { report: ScribeActivity.call(practice: current_practice, actor: current_user,
          page: page_param, per_page: per_page_param(default: 25, maximum: 50)) }
      end
    end
  end
end
