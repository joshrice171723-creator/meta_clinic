module Clinic
  module Reports
    class DailyInvoicesController < Clinic::ApiController
      def show
        date = date_param!(params[:date], field: :date)
        render json: { report: DailyInvoices.call(practice: current_practice, actor: current_user, date:) }
      end
    end
  end
end
