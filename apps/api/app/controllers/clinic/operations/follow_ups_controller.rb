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
        page = params[:page].present? ? bounded_integer!(params[:page], field: :page, min: 1, max: 1_000_000) : 1
        payload = Clinic::Operations::FollowUpWorklist.call(
          practice: current_practice,
          actor: current_user,
          filter: filter,
          site_id: site_id,
          page: page
        )
        Clinic::AuditRecorder.record!(
          practice: current_practice,
          actor: current_user,
          action_code: "operations.follow_up.read",
          outcome: :released,
          resource_version_ref: "follow_up_worklist:site/#{site_id || 'authorized'}:filter/#{filter}"
        )
        render json: payload
      end
    end
  end
end
