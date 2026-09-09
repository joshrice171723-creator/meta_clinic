module Clinic
  module Billing
    class RecordCashRefund
      def self.call(practice:, actor:, payment:, amount:, reason:)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.payment_record", legacy_action: "billing.write")
        ApplicationRecord.transaction do
          tender = Clinic::CashTender.where(practice: practice, payment_event_id: payment.id).first
          raise ArgumentError, "Only cash payments can be refunded from the drawer." unless tender
          drawer = practice.cash_drawer_sessions.lock.find(tender.cash_drawer_session_id)
          payment = Clinic::PaymentEvent.where(practice: practice).lock.find(payment.id)
          tender = payment.cash_tender or raise ArgumentError, "Only cash payments can be refunded from the drawer."
          raise ArgumentError, "Cash payment drawer details changed." unless tender.cash_drawer_session_id == drawer.id
          raise ArgumentError, "The cash drawer is closed." unless drawer.status == "open"
          value = Money.decimal(amount, name: "refund", positive: true)
          reason = required_reason!(reason)
          raise ArgumentError, "Cash refund exceeds the payment." if payment.refund_events.sum(:amount) + value > payment.amount
          refund = payment.refund_events.create!(practice: practice, patient: payment.patient, currency: payment.currency,
            amount: value, reason: reason)
          receipt = BillingReceipt.create!(practice: practice, patient: payment.patient, invoice: payment.allocations.first!.invoice,
            payment_event: payment, issued_by: actor, kind: "cash_refund", issued_at: Time.current,
            payload: { amount: value.to_s("F"), currency: payment.currency, refund_id: refund.id, reason: reason })
          [ refund, receipt ]
        end
      end

      def self.required_reason!(value)
        reason = value.to_s.strip
        raise ArgumentError, "Enter a reason for the cash refund." if reason.empty?
        raise ArgumentError, "Keep the cash-refund reason within 200 characters." if reason.length > 200

        reason
      end
      private_class_method :required_reason!
    end
  end
end
