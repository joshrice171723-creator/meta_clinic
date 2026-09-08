module Clinic
  module PatientPortal
    class InvoiceOnlinePaymentsController < BaseController
      before_action :require_payment_identity!

      rescue_from Billing::StripeGateway::Unavailable do |error|
        render json: { error: error.message, code: "stripe_unavailable" }, status: :service_unavailable
      end
      rescue_from Billing::StripeGateway::Invalid do |error|
        render json: { error: error.message, code: "stripe_invalid" }, status: :unprocessable_entity
      end
      rescue_from Billing::CreateCollectionIntent::IdempotencyConflict do |error|
        render json: { error: error.message, code: "idempotency_conflict" }, status: :conflict
      end
      rescue_from Clinic::Authorization::Denied do
        render json: { error: "Online payment access is unavailable." }, status: :forbidden
      end
      rescue_from Clinic::AuditRecorder::Unavailable do
        render json: { error: "Required audit evidence is unavailable." }, status: :service_unavailable
      end

      def start
        input = parameter_hash!(:online_payment, %i[request_key])
        result = Billing::StripeInvoicePayments.start(invoice: invoice, actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), gateway: Billing::StripeGateway.new)
        render_result(result, include_checkout_url: true, status: :accepted)
      end

      def reconcile
        render_result Billing::StripeInvoicePayments.reconcile(checkout: checkout, actor: current_user,
          gateway: Billing::StripeGateway.new)
      end

      def cancel
        input = parameter_hash!(:online_payment, %i[request_key])
        result = Billing::StripeInvoicePayments.cancel(checkout: checkout, actor: current_user,
          request_key: required_string!(input[:request_key], field: :request_key, maximum: 160), gateway: Billing::StripeGateway.new)
        render_result result
      end

      private

      def require_payment_identity!
        raise Clinic::Authorization::Denied unless patient_portal_identity && !development_omni_preview?
      end

      def invoice
        @invoice ||= portal_practice.invoices.where(patient: portal_patient).find(integer_id!(params[:id], field: :id))
      end

      def checkout
        invoice.invoice_stripe_checkouts.order(id: :desc).first!
      end

      def render_result(result, include_checkout_url: false, status: :ok)
        invoice.reload
        render json: {
          online_payment: Billing::InvoiceSerializer.online_payment(invoice, result: result, include_checkout_url: include_checkout_url),
          invoice: Billing::InvoiceSerializer.call(invoice, detail: true)
        }, status: status
      end
    end
  end
end
