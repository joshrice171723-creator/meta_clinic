module Clinic
  module Operations
    class FollowUpsController < Clinic::ApiController
      def index
        filter = enum_param!(
          params[:filter].presence || "all",
          field: :filter,
          allowed: Clinic::Operations::FollowUpWorklist::FILTERS
        )
        site_id = params[:site_id].present? ? requested_id!(params[:site_id], :site_id) : nil
        render json: Clinic::Operations::FollowUpWorklist.call(
          practice: current_practice,
          actor: current_user,
          filter: filter,
          site_id: site_id
        )
      end
    end
  end
end
