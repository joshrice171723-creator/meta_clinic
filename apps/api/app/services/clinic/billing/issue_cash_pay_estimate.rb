module Clinic
  module Billing
    class IssueCashPayEstimate
      def self.call(estimate:, practice:, actor:, policy_version:, delivery_method:, request_key:)
        Authorization.authorize_with_legacy!(practice: practice, actor: actor, action: "billing.invoice_draft", legacy_action: "billing.write")
        raise ArgumentError, "Only a draft GFE candidate can be issued." unless estimate.status == "draft" && estimate.classification == "gfe_candidate"
        raise ArgumentError, "A policy version is required before issuing a GFE." if policy_version.to_s.strip.blank?
        Clinic::Idempotency.execute(practice: practice, actor: actor, operation_code: "cash_pay_estimate.issue", request_key: request_key,
          payload: { estimate_id: estimate.id, policy_version: policy_version, delivery_method: delivery_method }, result_resource: ->(value) { value },
          resource_resolver: ->(practice:, receipt:) { CashPayEstimate.find_by(practice: practice, id: receipt.resource_id) }) do
          estimate.lock!
          estimate.update!(classification: "issued_gfe", status: "issued", issued_at: Time.current, policy_version: policy_version.to_s.strip, delivery_method: delivery_method.to_s.strip.presence)
          AuditRecorder.record!(practice: practice, actor: actor, action_code: "cash_pay_estimate.issue", outcome: :committed, resource_version_ref: "cash_pay_estimate/#{estimate.id}:#{estimate.revision}")
          estimate
        end.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
