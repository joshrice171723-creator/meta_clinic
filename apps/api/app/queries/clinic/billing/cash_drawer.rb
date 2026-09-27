module Clinic
  module Billing
    class CashDrawer
      def self.call(session)
        tenders = session.cash_tenders.includes(payment_event: :refund_events).to_a
        received = tenders.sum(BigDecimal("0")) { |tender| tender.tendered_amount - tender.change_amount }
        refunds = tenders.sum(BigDecimal("0")) { |tender| tender.payment_event.refund_events.sum(BigDecimal("0"), &:amount) }
        expected = session.opening_float + received - refunds
        {
          id: session.id, site_id: session.site_id, currency: session.currency, status: session.status, opening_float: session.opening_float.to_s("F"),
          cash_received: received.to_s("F"), cash_refunded: refunds.to_s("F"), expected_cash: expected.to_s("F"),
          counted_cash: session.counted_cash&.to_s("F"), discrepancy: session.discrepancy&.to_s("F"),
          discrepancy_explanation: session.discrepancy_explanation, opened_at: session.created_at.iso8601,
          closed_at: session.closed_at&.iso8601, reconciliation_status: session.reconciliation_status,
          reconciled_by_id: session.reconciled_by_id, reconciled_at: session.reconciled_at&.iso8601,
          reconciliation_note: session.reconciliation_note
        }
      end
    end
  end
end
