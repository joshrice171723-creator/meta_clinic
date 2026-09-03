module Clinic
  module PatientPortal
    class RequestsController < BaseController
      ALLOWED_TYPES = %w[message refill].freeze

      def index
        requests = Request.for_practice(portal_practice).where(patient: portal_patient).recent.limit(30)
        render json: { requests: requests.map { |request| request_payload(request) } }
      end

      def create
        input = parameter_hash!(:patient_portal_request, %i[request_key request_type content])
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        request_type = enum_param!(input[:request_type], field: :request_type, allowed: ALLOWED_TYPES)
        content = required_string!(input[:content], field: :content, maximum: 10_000)
        request = CreateRequest.call(practice: portal_practice, patient: portal_patient,
          identity: patient_portal_identity, request_key:, request_type:, content:)
        record_portal_read("patient_portal.request.create")
        render json: { request: request_payload(request) }, status: request.previously_new_record? ? :created : :ok
      end

      private

      def request_payload(request)
        {
          id: request.id,
          request_key: request.request_key,
          request_type: request.request_type,
          status: request.status,
          requested_at: request.requested_at.iso8601(6),
          reviewed_at: request.reviewed_at&.iso8601(6)
        }
      end
    end
  end
end
