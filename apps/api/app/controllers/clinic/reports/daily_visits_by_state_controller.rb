module Clinic
  module Reports
    class DailyVisitsByStateController < Clinic::ApiController
      def show
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id)) if params[:site_id].present?
        date = date_param!(params[:date], field: :date)
        page = params[:page].present? ? bounded_integer!(params[:page], field: :page, min: 1, max: 1_000_000) : 1
        report = DailyVisitsByState.call(practice: current_practice, actor: current_user, date: date, site: site, page: page)
        render json: { report: report }
      end
    end
  end
end
