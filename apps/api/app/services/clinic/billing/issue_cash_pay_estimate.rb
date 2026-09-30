module Clinic
  module Billing
    class IssueCashPayEstimate
      def self.call(estimate:, practice:, actor:, policy_version:, delivery_method:, request_key:, context: {})
        Authorization.authorize_with_legacy!(practice: practice, actor: actor, action: "billing.invoice_draft", legacy_action: "billing.write")
        raise ActiveRecord::RecordNotFound unless estimate.practice_id == practice.id
        raise ArgumentError, "A policy version is required before issuing a GFE." if policy_version.to_s.strip.blank?
        context = CreateCashPayEstimate.normalize_context(context)
        payload = { estimate_id: estimate.id, policy_version: policy_version, delivery_method: delivery_method }
        payload[:context] = context if context.any?
        Clinic::Idempotency.execute(practice: practice, actor: actor, operation_code: "cash_pay_estimate.issue", request_key: request_key,
          payload: payload, result_resource: ->(value) { value },
          authorization: -> { Authorization.authorize_with_legacy!(practice: practice, actor: actor, action: "billing.invoice_draft", legacy_action: "billing.write") },
          authorization_action: "billing.invoice_draft",
          resource_resolver: ->(practice:, receipt:) { CashPayEstimate.find_by(practice: practice, id: receipt.resource_id) }) do
          estimate.lock!
          raise ArgumentError, "Only a draft GFE candidate can be issued." unless estimate.status == "draft" && estimate.classification == "gfe_candidate"
          recorded = estimate.attributes.symbolize_keys.slice(*CashPayEstimate::CONTEXT_FIELDS).merge(context)
          if recorded[:payment_context] == "unknown" || recorded.values.any?(&:blank?)
            raise ArgumentError, "Record payment, request, and scheduled context before issuing a GFE."
          end
          predecessor = estimate.supersedes_id && CashPayEstimate.where(practice: practice).lock.find(estimate.supersedes_id)
          if predecessor && (predecessor.status != "issued" || predecessor.classification != "issued_gfe" || predecessor.patient_id != estimate.patient_id || predecessor.currency != estimate.currency)
            raise ArgumentError, "The preceding issued GFE is no longer eligible for correction."
          end
          site = practice.sites.find_by(id: estimate.patient&.primary_site_id)
          contact_snapshot = {
            practice_name: practice.name,
            site_name: site&.name,
            address: site&.formatted_address,
            phone: site&.phone.presence,
            email: site&.contact_email.presence
          }.select { |_key, value| value.present? }
          estimate.update!(recorded.merge(classification: "issued_gfe", status: "issued", issued_at: Time.current,
            policy_version: policy_version.to_s.strip, delivery_method: delivery_method.to_s.strip.presence,
            clinic_contact_snapshot: contact_snapshot))
          predecessor&.update!(status: "superseded")
          AuditRecorder.record!(practice: practice, actor: actor, action_code: "cash_pay_estimate.issue", outcome: :committed, resource_version_ref: "cash_pay_estimate/#{estimate.id}:#{estimate.revision}")
          estimate
        end.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end
    end
  end
end
