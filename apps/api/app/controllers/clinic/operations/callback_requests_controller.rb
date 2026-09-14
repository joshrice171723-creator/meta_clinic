module Clinic
  module Operations
    class CallbackRequestsController < Clinic::ApiController
      before_action -> { require_capability("appointments.read") }, only: :index
      before_action -> { require_capability("appointments.write") }, only: :transition

      def index
        requests = current_practice.patient_portal_requests.callback.includes(:patient)
          .where(status: %w[pending in_review]).order(requested_at: :asc, id: :asc).limit(100)
        render json: { callback_requests: requests.map { |request| payload(request) } }
      end

      def transition
        request = current_practice.patient_portal_requests.callback.find(requested_id!(params[:id], :id))
        input = parameter_hash!(:callback_request, %i[request_key status review_note])
        status = enum_param!(input[:status], field: :status, allowed: %w[in_review resolved declined])
        note = optional_string(input[:review_note], field: :review_note, maximum: 1_000)
        if status.in?(%w[resolved declined]) && note.blank?
          raise ArgumentError, "Record the actual contact outcome before closing this callback request."
        end
        updated = Clinic::PatientPortal::ReviewRequest.call(practice: current_practice, actor: current_user,
          request:, status:, review_note: note,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { callback_request: payload(updated) }
      end

      private

      def payload(request)
        { id: request.id, status: request.status, content: request.content,
          requested_at: request.requested_at.iso8601(6), reviewed_at: request.reviewed_at&.iso8601(6),
          review_note: request.review_note,
          patient: { id: request.patient.id, display_name: request.patient.display_name, reference: request.patient.reference } }
      end
    end
  end
end
