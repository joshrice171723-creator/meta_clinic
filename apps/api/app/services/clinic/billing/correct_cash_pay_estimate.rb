module Clinic
  module Billing
    class CorrectCashPayEstimate
      def self.call(predecessor:, practice:, actor:, reason:, lines:, request_key:)
        authorize!(practice: practice, actor: actor)
        raise ActiveRecord::RecordNotFound unless predecessor.practice_id == practice.id

        reason = reason.to_s.strip
        raise ArgumentError, "Explain the estimate correction in 500 characters or fewer." if reason.blank? || reason.length > 500

        outcome = Clinic::Idempotency.execute(practice: practice, actor: actor,
          operation_code: "cash_pay_estimate.correct", request_key: request_key,
          payload: { predecessor_id: predecessor.id, correction_reason: reason, lines: lines },
          authorization: -> { authorize!(practice: practice, actor: actor) },
          authorization_action: "billing.invoice_draft", result_resource: ->(estimate) { estimate },
          resource_resolver: ->(practice:, receipt:) { CashPayEstimate.find_by(practice: practice, id: receipt.resource_id) }) do
          predecessor = CashPayEstimate.where(practice: practice).lock.find(predecessor.id)
          unless predecessor.status == "issued" && predecessor.classification == "issued_gfe"
            raise ArgumentError, "Only the current issued GFE can be corrected."
          end
          if CashPayEstimate.where(practice: practice, supersedes_id: predecessor.id).exists?
            raise ArgumentError, "This estimate already has a correction draft. Review it before another correction."
          end
          historical_pairs = predecessor.lines.filter_map do |line|
            [ line.service_offering_id, line.billing_service_id ] if line.service_offering_id
          end
          normalized = CreateCashPayEstimate.normalize_lines(practice: practice, currency: predecessor.currency,
            lines: lines, historical_pairs: historical_pairs)
          estimate = CashPayEstimate.create!(practice: practice, patient: predecessor.patient,
            classification: "gfe_candidate", status: "draft", currency: predecessor.currency,
            supersedes: predecessor, revision: predecessor.revision + 1, correction_reason: reason)
          normalized.each { |line| estimate.lines.create!(line.merge(practice: practice)) }
          AuditRecorder.record!(practice: practice, actor: actor, action_code: "cash_pay_estimate.correct",
            outcome: :committed, resource_version_ref: "cash_pay_estimate/#{estimate.id}:#{estimate.revision}")
          estimate
        end
        outcome.value || raise(Clinic::Idempotency::OutcomeUnconfirmed)
      end

      def self.authorize!(practice:, actor:)
        Authorization.authorize_with_legacy!(practice: practice, actor: actor,
          action: "billing.invoice_draft", legacy_action: "billing.write")
      end
      private_class_method :authorize!
    end
  end
end
