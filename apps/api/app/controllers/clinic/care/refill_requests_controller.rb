module Clinic
  module Care
    class RefillRequestsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("clinical_records.read", "medication_requests.write", any_site: true) }, only: :index
      before_action -> { require_capability("medication_requests.write", any_site: true) }, only: %i[create transition]
      before_action -> { require_capability("patients.read") }

      def index
        requests = current_practice.patient_portal_requests.refill
          .includes(:patient)
          .order(requested_at: :asc, id: :asc)
          .limit(100)
        requests = requests.where(status: status_param) if status_param
        render json: { refill_requests: requests.map { |request| payload(request) } }
      end

      def create
        input = parameter_hash!(:refill_request,
          %i[request_key patient_id medication_name pharmacy_destination request_note])
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        identity = Clinic::PatientPortal::Identity.available.find_by(
          practice: current_practice,
          patient: patient
        )
        raise ArgumentError, "This patient needs active portal access before staff can open a refill request." unless identity

        content = Clinic::PatientPortal::RefillRequestData.content(
          medication_name: required_string!(input[:medication_name], field: :medication_name, maximum: 240),
          pharmacy_destination: required_string!(input[:pharmacy_destination], field: :pharmacy_destination, maximum: 500),
          request_note: optional_string(input[:request_note], field: :request_note, maximum: 2_000),
          source: "staff"
        )
        request = Clinic::PatientPortal::CreateRequest.call(
          practice: current_practice,
          patient: patient,
          identity: identity,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          request_type: "refill",
          content: content
        )
        render json: { refill_request: payload(request) }, status: request.previously_new_record? ? :created : :ok
      end

      def transition
        request = current_practice.patient_portal_requests.refill
          .includes(:patient).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:refill_request,
          %i[request_key status decision patient_message reconciliation_acknowledged reconciliation_note])
        status = enum_param!(input[:status], field: :status, allowed: %w[in_review resolved declined])
        decision = input[:decision].presence && enum_param!(input[:decision], field: :decision,
          allowed: Clinic::PatientPortal::RefillRequestData::DECISIONS)
        updated = Clinic::PatientPortal::ReviewRequest.call(
          practice: current_practice,
          actor: current_user,
          request: request,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          status: status,
          decision: decision,
          patient_message: optional_string(input[:patient_message], field: :patient_message, maximum: 600),
          reconciliation_acknowledged: input.key?(:reconciliation_acknowledged) &&
            boolean_param(input[:reconciliation_acknowledged], field: :reconciliation_acknowledged),
          reconciliation_note: optional_string(input[:reconciliation_note], field: :reconciliation_note, maximum: 200)
        )
        render json: { refill_request: payload(updated) }
      end

      private

      def status_param
        return unless params[:status].present?

        enum_param!(params[:status], field: :status,
          allowed: Clinic::PatientPortal::Request.statuses.keys)
      end

      def payload(request)
        Clinic::PatientPortal::RefillRequestSerializer.call(
          request,
          include_patient: true,
          include_review_details: true
        )
      end

      def sensitive_read_action
        "patient_portal.refill.read"
      end
    end
  end
end
