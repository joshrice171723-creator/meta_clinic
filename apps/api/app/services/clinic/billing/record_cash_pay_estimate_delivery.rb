module Clinic
  module Billing
    class RecordCashPayEstimateDelivery
      def self.call(estimate:, practice:, actor:, request_key:)
        authorize!(practice:, actor:)
        raise ActiveRecord::RecordNotFound unless estimate.practice_id == practice.id

        outcome = Clinic::Idempotency.execute(
          practice:, actor:, operation_code: "cash_pay_estimate.delivery.record", request_key:,
          payload: { estimate_id: estimate.id }, result_resource: ->(value) { value },
          authorization: -> { authorize!(practice:, actor:) }, authorization_action: "billing.invoice_draft",
          resource_resolver: ->(practice:, receipt:) { CashPayEstimate.find_by(practice:, id: receipt.resource_id) }
        ) do
          estimate.lock!
          unless estimate.classification == "issued_gfe" && estimate.status == "issued" && estimate.delivery_method.present?
            raise ArgumentError, "Issue a current GFE with a planned written delivery method before recording delivery."
          end
          raise ArgumentError, "Delivery was already recorded for this GFE." if estimate.delivered_at.present?

          estimate.update!(delivered_at: Current.business_time)
          AuditRecorder.record!(practice:, actor:, action_code: "cash_pay_estimate.delivery.record",
            outcome: :committed, resource_version_ref: "cash_pay_estimate/#{estimate.id}:#{estimate.revision}")
          estimate
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.authorize!(practice:, actor:)
        Authorization.authorize_with_legacy!(practice:, actor:,
          action: "billing.invoice_draft", legacy_action: "billing.write")
      end
      private_class_method :authorize!
    end
  end
end
