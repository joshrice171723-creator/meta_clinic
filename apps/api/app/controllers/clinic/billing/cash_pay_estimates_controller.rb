module Clinic
  module Billing
    class CashPayEstimatesController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.invoice_draft", "billing.write") }

      def create
        input = parameter_hash!(:estimate, %i[request_key patient_id classification currency], nested_arrays: { lines: %i[billing_service_id service_offering_id quantity inclusions exclusions] })
        estimate = CreateCashPayEstimate.call(practice: current_practice, actor: current_user,
          patient: input[:patient_id].present? ? current_practice.patients.find(requested_id!(input[:patient_id], :patient_id)) : nil,
          classification: input[:classification], currency: input[:currency], lines: input[:lines],
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { estimate: serialize(estimate) }, status: :created
      end

      def issue
        estimate = CashPayEstimate.where(practice: current_practice).find(requested_id!(params[:id], :id))
        input = parameter_hash!(:estimate, %i[request_key policy_version delivery_method])
        issued = IssueCashPayEstimate.call(estimate: estimate, practice: current_practice, actor: current_user,
          policy_version: required_string!(input[:policy_version], field: :policy_version, maximum: 80),
          delivery_method: optional_string(input[:delivery_method], field: :delivery_method, maximum: 40),
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160))
        render json: { estimate: serialize(issued) }
      end

      private
      def serialize(estimate)
        { id: estimate.id, patient_id: estimate.patient_id, classification: estimate.classification, status: estimate.status, currency: estimate.currency,
          policy_version: estimate.policy_version, delivery_method: estimate.delivery_method, issued_at: estimate.issued_at&.iso8601(6), revision: estimate.revision,
          lines: estimate.lines.map { |line| { id: line.id, billing_service_id: line.billing_service_id, service_offering_id: line.service_offering_id, quantity: line.quantity.to_s("F"), unit_amount: line.unit_amount.to_s("F"), expected_amount: line.expected_amount.to_s("F"), description: line.description_snapshot, inclusions: line.inclusions, exclusions: line.exclusions } } }
      end
    end
  end
end
