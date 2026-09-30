module Clinic
  module Billing
    class CashPayEstimatesController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.read", "billing.write") }, only: %i[index show invoice_comparison]
      before_action -> { require_capability_with_legacy("billing.invoice_draft", "billing.write") }, only: %i[create issue correct deliver]

      def index
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        estimates = CashPayEstimate.where(practice: current_practice, patient: patient)
          .includes(:lines).order(created_at: :desc, id: :desc).limit(201).to_a
        render json: { estimates: estimates.first(200).map { |estimate| serialize(estimate) }, truncated: estimates.length > 200 }
      end

      def show
        estimate = CashPayEstimate.where(practice: current_practice).includes(:lines).find(requested_id!(params[:id], :id))
        render json: { estimate: serialize(estimate) }
      end

      def invoice_comparison
        patient = current_practice.patients.find(requested_id!(params[:patient_id], :patient_id))
        comparison = EstimateInvoiceComparison.call(practice: current_practice, patient: patient,
          estimate_id: requested_id!(params[:id], :id), invoice_id: requested_id!(params[:invoice_id], :invoice_id))
        response.headers["Cache-Control"] = "no-store"
        render json: { comparison: comparison }
      end

      def create
        input = parameter_hash!(:estimate, %i[request_key patient_id classification currency payment_context request_context scheduled_context], nested_arrays: { lines: %i[billing_service_id service_offering_id quantity inclusions exclusions date_basis] })
        estimate = CreateCashPayEstimate.call(practice: current_practice, actor: current_user,
          patient: input[:patient_id].present? ? current_practice.patients.find(requested_id!(input[:patient_id], :patient_id)) : nil,
          classification: input[:classification], currency: input[:currency], lines: input[:lines],
          context: input.slice(*CashPayEstimate::CONTEXT_FIELDS),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { estimate: serialize(estimate) }, status: :created
      end

      def issue
        estimate = CashPayEstimate.where(practice: current_practice).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:estimate, %i[request_key policy_version delivery_method payment_context request_context scheduled_context])
        issued = IssueCashPayEstimate.call(estimate: estimate, practice: current_practice, actor: current_user,
          policy_version: required_string!(input[:policy_version], field: :policy_version, maximum: 80),
          delivery_method: optional_string(input[:delivery_method], field: :delivery_method, maximum: 40),
          context: input.slice(*CashPayEstimate::CONTEXT_FIELDS),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { estimate: serialize(issued) }
      end

      def correct
        predecessor = CashPayEstimate.where(practice: current_practice).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:estimate, %i[request_key reason payment_context request_context scheduled_context], nested_arrays: { lines: %i[billing_service_id service_offering_id quantity inclusions exclusions date_basis] })
        estimate = CorrectCashPayEstimate.call(predecessor: predecessor, practice: current_practice, actor: current_user,
          reason: required_string!(input[:reason], field: :reason, maximum: 500), lines: input[:lines]&.map(&:to_h),
          context: input.slice(*CashPayEstimate::CONTEXT_FIELDS),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { estimate: serialize(estimate) }, status: :created
      end

      def deliver
        estimate = CashPayEstimate.where(practice: current_practice).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:estimate, %i[request_key])
        delivered = RecordCashPayEstimateDelivery.call(estimate:, practice: current_practice, actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { estimate: serialize(delivered) }
      end

      private
      def serialize(estimate)
        { id: estimate.id, patient_id: estimate.patient_id,
          practice_name: current_practice.name, clinic_contact_snapshot: estimate.clinic_contact_snapshot,
          total_amount: estimate.lines.sum(&:expected_amount).to_s("F"),
          classification: estimate.classification, status: estimate.status, currency: estimate.currency,
          policy_version: estimate.policy_version, delivery_method: estimate.delivery_method, issued_at: estimate.issued_at&.iso8601(6),
          delivered_at: estimate.delivered_at&.iso8601(6), supersedes_id: estimate.supersedes_id, correction_reason: estimate.correction_reason,
          revision: estimate.revision, payment_context: estimate.payment_context, request_context: estimate.request_context, scheduled_context: estimate.scheduled_context,
          lines: estimate.lines.map { |line| { id: line.id, billing_service_id: line.billing_service_id, source_price_revision: line.source_price_revision, service_offering_id: line.service_offering_id, quantity: line.quantity.to_s("F"), unit_amount: line.unit_amount.to_s("F"), expected_amount: line.expected_amount.to_s("F"), description: line.description_snapshot, inclusions: line.inclusions, exclusions: line.exclusions, date_basis: line.date_basis } } }
      end
    end
  end
end
