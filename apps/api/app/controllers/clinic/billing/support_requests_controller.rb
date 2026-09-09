module Clinic
  module Billing
    class SupportRequestsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.read", "billing.write", any_site: true) }, only: :index
      before_action -> { require_capability("billing.write", any_site: true) }, only: :transition

      def index
        requests = current_practice.patient_portal_requests.message
          .includes(:patient)
          .order(requested_at: :asc, id: :asc)
          .limit(100)
        requests = requests.where(status: status_param) if status_param
        render json: { support_requests: requests.map { |request| payload(request) } }
      end

      def transition
        request = current_practice.patient_portal_requests.message.find(requested_id!(params[:id], :id))
        input = parameter_hash!(:support_request, %i[request_key status review_note])
        updated = Clinic::PatientPortal::ReviewRequest.call(
          practice: current_practice,
          actor: current_user,
          request: request,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          status: enum_param!(input[:status], field: :status, allowed: %w[in_review resolved declined]),
          review_note: optional_string(input[:review_note], field: :review_note, maximum: 1_000)
        )
        render json: { support_request: payload(updated) }
      end

      private

      def status_param
        return unless params[:status].present?

        enum_param!(params[:status], field: :status,
          allowed: Clinic::PatientPortal::Request.statuses.keys)
      end

      def payload(request)
        {
          id: request.id,
          status: request.status,
          content: request.content,
          requested_at: request.requested_at.iso8601(6),
          reviewed_at: request.reviewed_at&.iso8601(6),
          review_note: request.review_note,
          patient: {
            id: request.patient.id,
            display_name: request.patient.display_name,
            reference: request.patient.reference
          }
        }
      end
    end
  end
end
