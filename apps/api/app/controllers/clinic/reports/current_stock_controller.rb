module Clinic
  module Reports
    class CurrentStockController < Clinic::ApiController
      def show
        page = params[:page].present? ? bounded_integer!(params[:page], field: :page, min: 1, max: 999_999) : 1
        office_page = params[:office_page].present? ? bounded_integer!(params[:office_page], field: :office_page, min: 1, max: 999_999) : 1
        status = enum_param!(params[:status].presence || "all", field: :status, allowed: %w[all available held expired])
        render json: { report: CurrentStock.call(practice: current_practice, actor: current_user, page:, office_page:, status:) }
      end
    end
  end
end
