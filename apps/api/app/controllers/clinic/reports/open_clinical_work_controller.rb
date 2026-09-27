module Clinic
  module Reports
    class OpenClinicalWorkController < Clinic::ApiController
      def show
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id)) if params[:site_id].present?
        render json: { report: OpenClinicalWork.call(practice: current_practice, actor: current_user, site:) }
      end
    end
  end
end
