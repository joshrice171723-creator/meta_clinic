module Clinic
  module Reports
    class DailyCashDrawersController < Clinic::ApiController
      def show
        date = date_param!(params[:date], field: :date)
        page = params[:page].present? ? bounded_integer!(params[:page], field: :page, min: 1, max: 1_000_000) : 1
        render json: { report: DailyCashDrawers.call(practice: current_practice, actor: current_user, date:, page:) }
      end
    end
  end
end
