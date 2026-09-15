module Clinic
  module Scheduling
    class CalendarController < Clinic::ApiController
      def show
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id))
        require_capability("appointments.read", site: site)
        date = date_param!(params[:date], field: :date)
        render json: Calendar.new(practice: current_practice, site: site, date: date, actor: current_user).call
      end
    end
  end
end
