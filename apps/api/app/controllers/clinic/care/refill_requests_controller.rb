module Clinic
  module Care
    class RefillRequestsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("clinical_records.read", "medication_requests.write", any_site: true) }, only: :index
      before_action -> { require_capability("medication_requests.write", any_site: true) }, only: %i[create transition retry_delivery]
      before_action -> { require_capability("patients.read") }

      def index
        requests = current_practice.patient_portal_requests.refill
        requests = requests.where(status: status_param) if status_param
        if params[:delivery].present?
          enum_param!(params[:delivery], field: :delivery, allowed: %w[failed])
          requests = requests.joins(:refill_response_delivery)
            .where(clinic_refill_response_deliveries: { state: "failed" })
        end
        page = page_param
        per_page = per_page_param(default: 100, maximum: 100)
        total = requests.count
        requests = requests.includes(:patient, :refill_response_delivery)
          .order(requested_at: :asc, id: :asc)
          .offset((page - 1) * per_page).limit(per_page)
        render json: { refill_requests: requests.map { |request| payload(request) }, pagination: { page:, per_page:, total: } }
      end

      def create
        input = parameter_hash!(:refill_request,
          %i[request_key patient_id medication_name pharmacy_destination medication_request_series_id request_note])
        patient = current_practice.patients.find(requested_id!(input[:patient_id], :patient_id))
        prior_series_id = optional_string(input[:medication_request_series_id], field: :medication_request_series_id, maximum: 36)
        if prior_series_id.present?
          Clinic::Care::MedicationRequestRevision.where(practice: current_practice, patient:, series_id: prior_series_id).first ||
            raise(ActiveRecord::RecordNotFound)
        end
        content = Clinic::PatientPortal::RefillRequestData.content(
          medication_name: required_string!(input[:medication_name], field: :medication_name, maximum: 240),
          pharmacy_destination: required_string!(input[:pharmacy_destination], field: :pharmacy_destination, maximum: 500),
          medication_request_series_id: prior_series_id,
          request_note: optional_string(input[:request_note], field: :request_note, maximum: 2_000),
          source: "staff"
        )
        request = Clinic::PatientPortal::CreateRequest.call(
          practice: current_practice,
          patient: patient,
          identity: nil,
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
          %i[request_key status decision patient_message reconciliation_acknowledged reconciliation_note encounter_id])
        status = enum_param!(input[:status], field: :status, allowed: %w[in_review resolved declined])
        decision = input[:decision].presence && enum_param!(input[:decision], field: :decision,
          allowed: Clinic::PatientPortal::RefillRequestData::DECISIONS)
        encounter = input[:encounter_id].present? ? current_practice.encounters
          .where(patient_id: request.patient_id).find(requested_id!(input[:encounter_id], :encounter_id)) : nil
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
          reconciliation_note: optional_string(input[:reconciliation_note], field: :reconciliation_note, maximum: 200),
          encounter: encounter
        )
        render json: { refill_request: payload(updated) }
      end

      def retry_delivery
        request = current_practice.patient_portal_requests.refill
          .includes(:patient, :refill_response_delivery).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:delivery, %i[request_key])
        Clinic::PatientPortal::DeliverRefillResponse.call(
          practice: current_practice,
          actor: current_user,
          request: request,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160)
        )
        request.reload
        render json: { refill_request: payload(request) }
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
