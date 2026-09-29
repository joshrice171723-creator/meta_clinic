module Clinic
  module PatientPortal
    class RequestsController < BaseController
      ALLOWED_TYPES = %w[message refill callback].freeze

      def index
        request_type = requested_type
        requests = Request.for_practice(portal_practice).public_send(request_type)
          .where(patient: portal_patient).recent.limit(30)
        record_portal_read("patient_portal.#{request_type == 'message' ? 'billing_support' : request_type}.read")
        render json: { requests: requests.map { |request| request_payload(request) } }
      end

      def create
        input = parameter_hash!(:patient_portal_request,
          %i[request_key request_type content medication_name pharmacy_destination request_note])
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        request_type = enum_param!(input[:request_type], field: :request_type, allowed: ALLOWED_TYPES)
        content = request_content(input, request_type)
        request = CreateRequest.call(practice: portal_practice, patient: portal_patient,
          identity: patient_portal_identity, request_key:, request_type:, content:)
        record_portal_read("patient_portal.request.create")
        render json: { request: request_payload(request) }, status: request.previously_new_record? ? :created : :ok
      end

      private

      def requested_type
        return "message" if params[:request_type].blank?

        enum_param!(params[:request_type], field: :request_type, allowed: ALLOWED_TYPES)
      end

      def request_content(input, request_type)
        if request_type.in?(%w[message callback])
          if %i[medication_name pharmacy_destination request_note].any? { |field| input[field].present? }
            raise ArgumentError, "Medication and pharmacy fields are supported only for refill requests."
          end
          return required_string!(input[:content], field: :content, maximum: 10_000)
        end
        raise ArgumentError, "content is supported only for billing messages." if input[:content].present?

        RefillRequestData.content(
          medication_name: required_string!(input[:medication_name], field: :medication_name, maximum: 240),
          pharmacy_destination: required_string!(input[:pharmacy_destination], field: :pharmacy_destination, maximum: 500),
          request_note: optional_string(input[:request_note], field: :request_note, maximum: 2_000),
          source: "patient"
        )
      end

      def request_payload(request)
        return RefillRequestSerializer.call(request) if request.refill?

        {
          id: request.id,
          request_key: request.request_key,
          request_type: request.request_type,
          content: request.content,
          status: request.status,
          requested_at: request.requested_at.iso8601(6),
          reviewed_at: request.reviewed_at&.iso8601(6)
        }
      end
    end
  end
end
