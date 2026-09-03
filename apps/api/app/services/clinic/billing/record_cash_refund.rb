module Clinic
  module Billing
    class RecordCashRefund
      def self.call(practice:, actor:, payment:, amount:)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.payment_record", legacy_action: "billing.write")
        payment.with_lock do
          tender = payment.cash_tender or raise ArgumentError, "Only cash payments can be refunded from the drawer."
          raise ArgumentError, "The cash drawer is closed." unless tender.cash_drawer_session.status == "open"
          value = Money.decimal(amount, name: "refund", positive: true)
          raise ArgumentError, "Cash refund exceeds the payment." if payment.refund_events.sum(:amount) + value > payment.amount
          refund = payment.refund_events.create!(practice: practice, patient: payment.patient, currency: payment.currency, amount: value)
          receipt = BillingReceipt.create!(practice: practice, patient: payment.patient, invoice: payment.allocations.first!.invoice,
            payment_event: payment, issued_by: actor, kind: "cash_refund", issued_at: Time.current,
            payload: { amount: value.to_s("F"), currency: payment.currency, refund_id: refund.id })
          [ refund, receipt ]
        end
      end
    end
  end
end
