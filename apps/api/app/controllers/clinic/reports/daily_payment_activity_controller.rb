module Clinic
  module Reports
    class DailyPaymentActivityController < Clinic::ApiController
      def show
        date = date_param!(params[:date], field: :date)
        payment_page = params[:payment_page].present? ? bounded_integer!(params[:payment_page], field: :payment_page, min: 1, max: 1_000_000) : 1
        refund_page = params[:refund_page].present? ? bounded_integer!(params[:refund_page], field: :refund_page, min: 1, max: 1_000_000) : 1
        render json: { report: DailyPaymentActivity.call(practice: current_practice, actor: current_user, date:, payment_page:, refund_page:) }
      end
    end
  end
end
