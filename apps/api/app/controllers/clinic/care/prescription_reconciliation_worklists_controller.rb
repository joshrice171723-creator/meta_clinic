module Clinic
  module Care
    class PrescriptionReconciliationWorklistsController < Clinic::ApiController
      def show
        site = current_practice.sites.find(requested_id!(params[:site_id], :site_id)) if params[:site_id].present?
        result = PrescriptionReconciliationWorklist.call(practice: current_practice, actor: current_user, site:)
        Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
          action_code: "clinical_records.read", outcome: :released)
        render json: result
      end
    end
  end
end
