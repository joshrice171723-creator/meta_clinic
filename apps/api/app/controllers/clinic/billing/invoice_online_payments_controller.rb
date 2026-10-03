module Clinic
  module Billing
    class InvoiceOnlinePaymentsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.payment_record", "billing.write") }

      rescue_from StripeGateway::Unavailable do |error|
        render json: { error: error.message, code: "stripe_unavailable" }, status: :service_unavailable
      end
      rescue_from StripeGateway::Invalid do |error|
        render json: { error: error.message, code: "stripe_invalid" }, status: :unprocessable_entity
      end
      rescue_from CreateCollectionIntent::IdempotencyConflict do |error|
        render json: { error: error.message, code: "idempotency_conflict" }, status: :conflict
      end

      def start
        input = parameter_hash!(:online_payment, %i[request_key])
        result = StripeInvoicePayments.start(invoice: invoice, actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), gateway: StripeGateway.new)
        render_result(result, include_checkout_url: true, status: :accepted)
      end

      def reconcile
        render_result StripeInvoicePayments.reconcile(checkout: checkout, actor: current_user, gateway: StripeGateway.new)
      end

      def simulate
        input = parameter_hash!(:online_payment, %i[request_key amount outcome])
        intent = Development::InvoicePaymentSimulator.collect!(invoice:, actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160),
          amount: input[:amount], outcome: input[:outcome].to_s)
        invoice.reload
        render json: {
          online_payment: InvoiceSerializer.online_payment(invoice),
          invoice: InvoiceSerializer.call(invoice, detail: true),
          simulation: { collection_intent_id: intent.id, state: intent.state,
            amount: intent.amount.to_s("F"), currency: intent.currency, mode: "test", processor: intent.processor }
        }
      end

      def cancel
        input = parameter_hash!(:online_payment, %i[request_key])
        result = StripeInvoicePayments.cancel(checkout: checkout, actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), gateway: StripeGateway.new)
        render_result result
      end

      private

      def invoice
        @invoice ||= current_practice.invoices.find(requested_id!(params[:id], :id))
      end

      def checkout
        invoice.invoice_stripe_checkouts.order(id: :desc).first!
      end

      def render_result(result, include_checkout_url: false, status: :ok)
        invoice.reload
        render json: {
          online_payment: InvoiceSerializer.online_payment(invoice, result: result, include_checkout_url: include_checkout_url),
          invoice: InvoiceSerializer.call(invoice, detail: true)
        }, status: status
      end
    end
  end
end
