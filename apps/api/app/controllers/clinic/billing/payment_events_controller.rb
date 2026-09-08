module Clinic
  module Billing
    class PaymentEventsController < Clinic::ApiController
      content_security_policy only: :receipt do |policy|
        request.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(32) }
        request.content_security_policy_nonce_directives = %w[script-src style-src]
        policy.script_src :self
        policy.style_src :self
      end

      before_action -> { require_capability_with_legacy("billing.read", "billing.write") }, only: :receipt
      before_action -> { require_capability_with_legacy("billing.payment_record", "billing.write") }, only: %i[cash_refunds allocate]

      def allocate
        input = parameter_hash!(:allocation, %i[invoice_id amount request_key])
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        payment = PaymentEvent.where(practice: current_practice).find(requested_id!(params[:id], :id))
        invoice = current_practice.invoices.find(requested_id!(input[:invoice_id], :invoice_id))
        patient = current_practice.patients.find(payment.patient_id)
        amount = decimal_string!(input[:amount], field: :amount)
        outcome = Clinic::Idempotency.execute(
          practice: current_practice,
          actor: current_user,
          operation_code: "billing.payment_allocation",
          request_key: request_key,
          payload: { payment_event_id: payment.id, patient_id: patient.id, invoice_id: invoice.id, amount: amount },
          resource: payment,
          authorization: -> {
            Authorization.authorize_with_legacy!(actor: current_user, practice: current_practice,
              action: "billing.payment_record", legacy_action: "billing.write")
          },
          authorization_action: "billing.payment_record",
          result_resource: ->(allocation) { allocation },
          resource_resolver: ->(practice:, receipt:) {
            Clinic::PaymentAllocation.where(practice_id: practice.id).find_by(id: receipt.resource_id)
          }
        ) do
          allocation = AllocatePayment.call(
            practice: current_practice,
            actor: current_user,
            patient: patient,
            invoice: invoice,
            external_event_reference: payment.external_event_reference,
            currency: payment.currency,
            amount: amount,
            payment_amount: payment.amount.to_s("F")
          )
          Clinic::AuditRecorder.record!(practice: current_practice, actor: current_user,
            action_code: "billing.payment_allocation", outcome: :committed,
            resource_version_ref: "Clinic::PaymentAllocation/#{allocation.id}")
          allocation
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        allocation = outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed payment allocation is unavailable.")
        payment = allocation.payment_event
        allocated = payment.allocations.reload.sum(:amount)
        refunded = payment.refund_events.sum(:amount)
        render json: {
          payment_allocation: {
            id: allocation.id,
            payment_event_id: allocation.payment_event_id,
            invoice_id: allocation.invoice_id,
            amount: allocation.amount.to_s("F")
          },
          payment: {
            amount: payment.amount.to_s("F"),
            allocated_amount: allocated.to_d.to_s("F"),
            unapplied_amount: [payment.amount - allocated - refunded, 0].max.to_d.to_s("F")
          }
        }, status: :created
      end

      def cash_refunds
        input = parameter_hash!(:cash_refund, %i[amount reason request_key])
        payment = PaymentEvent.where(practice: current_practice).find(requested_id!(params[:id], :id))
        amount = Money.decimal(decimal_string!(input[:amount], field: :amount), name: "refund", positive: true).to_s("F")
        reason = required_string!(input[:reason], field: :reason, maximum: 200)
        request_key = required_string!(input[:request_key], field: :request_key, maximum: 160)
        outcome = Clinic::Idempotency.execute(
          practice: current_practice,
          actor: current_user,
          operation_code: "billing.cash_refund",
          request_key: request_key,
          payload: { payment_event_id: payment.id, amount: amount, reason: reason },
          resource: payment,
          authorization: -> {
            Authorization.authorize_with_legacy!(actor: current_user, practice: current_practice,
              action: "billing.payment_record", legacy_action: "billing.write")
          },
          authorization_action: "billing.payment_record",
          result_resource: ->(result) { result.first },
          resource_resolver: ->(practice:, receipt:) {
            Clinic::RefundEvent.where(practice_id: practice.id, payment_event_id: payment.id).find_by(id: receipt.resource_id)
          }
        ) do
          RecordCashRefund.call(practice: current_practice, actor: current_user, payment: payment, amount: amount, reason: reason)
        end
        raise Clinic::Idempotency::OutcomeUnconfirmed if outcome.receipt.outcome_outcome_unconfirmed?

        refund, receipt = if outcome.replayed
          replayed_refund = outcome.value || raise(Clinic::Idempotency::InvalidRequest, "The committed cash refund is unavailable.")
          replayed_receipt = payment.billing_receipts.where(kind: "cash_refund")
            .where("payload ->> 'refund_id' = ?", replayed_refund.id.to_s).first!
          [ replayed_refund, replayed_receipt ]
        else
          outcome.value
        end
        render json: {
          refund: { id: refund.id, amount: refund.amount.to_s("F"), currency: refund.currency, reason: refund.reason },
          receipt_id: receipt.id,
          replayed: outcome.replayed,
          request_key: request_key
        }, status: outcome.replayed ? :ok : :created
      end

      def receipt
        payment = PaymentEvent.where(practice: current_practice).find(requested_id!(params[:id], :id))
        receipts = payment.billing_receipts
        @receipt = if params[:receipt_id].present?
          receipts.find(requested_id!(params[:receipt_id], :receipt_id))
        else
          receipts.where(kind: %w[cash_payment subscription_payment]).order(:issued_at, :id).first!
        end
        @payment = payment
        @practice = current_practice
        @refunds = payment.refund_events.order(:created_at, :id)
        response.headers["Cache-Control"] = "no-store"
        render template: "clinic/billing/payment_events/receipt", formats: [:html], layout: false
      end
    end
  end
end
