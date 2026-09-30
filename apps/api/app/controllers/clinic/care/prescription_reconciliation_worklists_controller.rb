module Clinic
  module Care
    class PrescriptionReconciliationWorklistsController < Clinic::ApiController
      def show
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id)) if params[:site_id].present?
        page = params[:page].present? ? bounded_integer!(params[:page], field: :page, min: 1, max: 999_999) : 1
        result = PrescriptionReconciliationWorklist.call(practice: current_practice, actor: current_user, site:, page:)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "clinical_records.read", outcome: :released)
        render json: result
      end
    end
  end
end
