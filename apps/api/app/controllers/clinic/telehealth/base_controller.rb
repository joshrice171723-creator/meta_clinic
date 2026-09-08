module Clinic
  module Telehealth
    class BaseController < Clinic::ApiController
      rescue_from Clinic::Telehealth::Error do |error|
        payload = { error: error.message, code: error.code, correlation_id: request.request_id,
          retryable: error.retryable }
        payload[:field] = error.field if error.field
        render json: payload, status: error.status
      end
      rescue_from Clinic::Idempotency::Conflict do
        render json: { error: "That request key was already used for different operation data.",
          code: "idempotency_conflict", correlation_id: request.request_id, retryable: false }, status: :conflict
      end
      rescue_from Clinic::Idempotency::InvalidRequest do |error|
        render json: { error: error.message, code: "invalid_request", correlation_id: request.request_id,
          retryable: false }, status: :bad_request
      end
      rescue_from Clinic::Idempotency::OutcomeUnconfirmed do
        render json: { error: "The operation outcome is unconfirmed. Look up the protected receipt before retrying.",
          code: "outcome_unconfirmed", correlation_id: request.request_id, retryable: false }, status: :conflict
      end
      rescue_from ActiveRecord::StaleObjectError do
        render json: { error: "This video visit changed. Reload before trying again.", code: "stale_record",
          correlation_id: request.request_id, retryable: false }, status: :conflict
      end

      private

      def telehealth_visit
        @telehealth_visit ||= Clinic::Telehealth::VisitDetail.call(practice: current_practice, actor: current_user,
          public_id: params[:visit_id] || params[:id])
      end

      def command_input
        params.permit(:request_key, :expected_version, :reason_code, :requested_expires_at, :checkin_id,
          :membership_id).to_h.symbolize_keys
      end

      def telehealth_input(root, allowed_fields)
        params.require(root).permit(*allowed_fields).to_h.symbolize_keys
      end

      def envelope(data, version:, allowed_actions: [], as_of: Time.current)
        { data: data, as_of: as_of.iso8601(6), version: version, allowed_actions: allowed_actions }
      end

      def render_visit(visit = telehealth_visit, status: :ok, include_preparation: true, operation: nil)
        data = { visit: Clinic::Telehealth::VisitSerializer.call(visit.reload, actor: current_user,
          include_preparation: include_preparation) }
        data[:operation] = { id: operation.id.to_s, status: operation.status } if operation
        render json: envelope(data, version: visit.lock_version, allowed_actions: data[:visit][:allowed_actions]), status: status
      end

      def render_telehealth(data:, visit:, status: :ok, allowed_actions: nil)
        actions = allowed_actions || data.dig(:scribe, :allowed_actions) || []
        render json: envelope(data, version: visit.lock_version, allowed_actions: actions), status: status
      end
    end
  end
end
