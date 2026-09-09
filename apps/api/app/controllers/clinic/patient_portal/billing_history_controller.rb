module Clinic
  module PatientPortal
    class BillingHistoryController < BaseController
      def index
        kind = params[:kind].to_s
        before = params[:before].present? ? requested_id!(params[:before], :before) : nil
        page = Clinic::Billing::PatientLedger.history_page(
          practice: portal_practice,
          patient: portal_patient,
          kind: kind,
          before: before
        )
        record_portal_read("patient_portal.billing_history.read")
        render json: page
      end
    end
  end
end
