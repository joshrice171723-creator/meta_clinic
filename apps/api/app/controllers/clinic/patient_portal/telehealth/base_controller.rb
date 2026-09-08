module Clinic
  module PatientPortal
    module Telehealth
      class BaseController < Clinic::PatientPortal::BaseController
        rescue_from Clinic::Telehealth::Error do |error|
          payload = { error: error.message, code: error.code, correlation_id: request.request_id,
            retryable: error.retryable }
          payload[:field] = error.field if error.field
          render json: payload, status: error.status
        end
        rescue_from ActiveRecord::StaleObjectError do
          render json: { error: "This video visit changed. Reload before trying again.", code: "stale_record",
            correlation_id: request.request_id, retryable: false }, status: :conflict
        end
        rescue_from Clinic::Idempotency::Conflict do
          render json: { error: "That request key was already used for different data.", code: "idempotency_conflict",
            correlation_id: request.request_id, retryable: false }, status: :conflict
        end

        private

        def patient_telehealth_visit
          @patient_telehealth_visit ||= Clinic::Telehealth::PatientVisitDetail.call(identity: patient_portal_identity,
            public_id: params[:visit_id] || params[:id])
        end

        def envelope(data, version:, allowed_actions: [], as_of: Time.current)
          { data: data, as_of: as_of.iso8601(6), version: version, allowed_actions: allowed_actions }
        end

        def telehealth_input(root, allowed_fields)
          params.require(root).permit(*allowed_fields).to_h.symbolize_keys
        end

        def render_patient_visit(visit = patient_telehealth_visit, status: :ok)
          projection = Clinic::Telehealth::PatientVisitSerializer.call(visit.reload, identity: patient_portal_identity)
          render json: envelope({ visit: projection }, version: visit.lock_version,
            allowed_actions: projection[:allowed_actions]), status: status
        end

        def render_telehealth(data:, visit:, status: :ok, allowed_actions: nil)
          actions = allowed_actions || data.dig(:scribe, :allowed_actions) || []
          render json: envelope(data, version: visit.lock_version, allowed_actions: actions), status: status
        end
      end
    end
  end
end
