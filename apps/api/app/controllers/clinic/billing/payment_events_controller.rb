module Clinic
  module Billing
    class PaymentEventsController < Clinic::ApiController
      before_action -> { require_capability_with_legacy("billing.read", "patients.read") }, only: :receipt
      before_action -> { require_capability_with_legacy("billing.payment_record", "billing.write") }, only: %i[cash_refunds allocate]

      def allocate
        input = parameter_hash!(:allocation, %i[invoice_id amount])
        payment = PaymentEvent.where(practice: current_practice).find(requested_id!(params[:id], :id))
        invoice = current_practice.invoices.find(requested_id!(input[:invoice_id], :invoice_id))
        patient = current_practice.patients.find(payment.patient_id)
        allocation = AllocatePayment.call(
          practice: current_practice,
          actor: current_user,
          patient: patient,
          invoice: invoice,
          external_event_reference: payment.external_event_reference,
          currency: payment.currency,
          amount: decimal_string!(input[:amount], field: :amount),
          payment_amount: payment.amount.to_s("F")
        )
        allocated = payment.allocations.reload.sum(:amount)
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
            unapplied_amount: [payment.amount - allocated, 0].max.to_d.to_s("F")
          }
        }, status: :created
      end

      def cash_refunds
        input = parameter_hash!(:cash_refund, %i[amount])
        payment = PaymentEvent.where(practice: current_practice).find(requested_id!(params[:id], :id))
        refund, receipt = RecordCashRefund.call(practice: current_practice, actor: current_user, payment: payment,
          amount: decimal_string!(input[:amount], field: :amount))
        render json: { refund: { id: refund.id, amount: refund.amount.to_s("F"), currency: refund.currency }, receipt_id: receipt.id }, status: :created
      end

      def receipt
        payment = PaymentEvent.where(practice: current_practice).find(requested_id!(params[:id], :id))
        receipt = payment.billing_receipts.order(issued_at: :desc, id: :desc).first!
        response.headers["Cache-Control"] = "no-store"
        render html: receipt_html(receipt).html_safe, content_type: "text/html"
      end

      private

      def receipt_html(receipt)
        <<~HTML
          <!doctype html><title>Receipt ##{receipt.id}</title><style>body{font:16px system-ui;max-width:640px;margin:48px auto}dt{color:#555}dd{margin:0 0 16px;font-weight:600}@media print{body{margin:0}}</style>
          <h1>Payment receipt</h1><dl><dt>Receipt</dt><dd>##{receipt.id}</dd><dt>Type</dt><dd>#{ERB::Util.html_escape(receipt.kind.humanize)}</dd><dt>Issued</dt><dd>#{receipt.issued_at.iso8601}</dd><dt>Amount</dt><dd>#{ERB::Util.html_escape(receipt.payload.fetch("currency"))} #{ERB::Util.html_escape(receipt.payload.fetch("amount"))}</dd></dl><script>window.print()</script>
        HTML
      end
    end
  end
end
