module Clinic
  module Billing
    class RecordCashPayment
      def self.call(practice:, actor:, patient:, invoice:, drawer_session:, tendered_amount:, allocation_amount:, request_key:)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.payment_record", legacy_action: "billing.write")
        tendered = Money.decimal(tendered_amount, name: "cash tender", positive: true)
        allocated = Money.decimal(allocation_amount, name: "allocation", positive: true)
        raise ArgumentError, "Cash tender must cover the allocation amount." if tendered < allocated

        ApplicationRecord.transaction do
          existing_tender = practice.cash_tenders.lock.find_by(request_key: request_key)
          if existing_tender
            existing_allocation = existing_tender.payment_event.allocations.find_by(invoice: invoice)
            unless existing_allocation && existing_tender.patient_id == patient.id &&
              existing_tender.cash_drawer_session_id == drawer_session.id &&
              existing_tender.tendered_amount == tendered &&
              existing_tender.change_amount == tendered - allocated &&
              existing_allocation.amount == allocated
              raise ArgumentError, "Cash tender details do not match the original payment."
            end
            return existing_allocation
          end

          drawer = practice.cash_drawer_sessions.lock.find(drawer_session.id)
          raise ArgumentError, "The cash drawer is closed." unless drawer.status == "open"
          raise ArgumentError, "The cash drawer does not belong to this invoice's practice." unless drawer.practice_id == invoice.practice_id

          allocation = AllocatePayment.call(
            practice: practice, actor: actor, patient: patient, invoice: invoice,
            external_event_reference: "cash:#{drawer.id}:#{request_key}", currency: invoice.currency,
            amount: allocated.to_s("F"), payment_amount: allocated.to_s("F")
          ) do |payment, created_allocation|
            CashTender.create!(
              practice: practice, patient: patient, payment_event: payment, cash_drawer_session: drawer,
              tendered_amount: tendered, change_amount: tendered - allocated, recorded_by: actor, request_key: request_key
            )
            BillingReceipt.create!(practice: practice, patient: patient, invoice: invoice, payment_event: payment,
              issued_by: actor, kind: "cash_payment", issued_at: Time.current,
              payload: { allocation_id: created_allocation.id, amount: allocated.to_s("F"), currency: invoice.currency, change_amount: (tendered - allocated).to_s("F") })
          end
          tender = allocation.payment_event.cash_tender
          raise ArgumentError, "The recorded cash tender is incomplete." unless tender
          unless tender.cash_drawer_session_id == drawer.id && tender.tendered_amount == tendered && tender.change_amount == tendered - allocated
            raise ArgumentError, "Cash tender details do not match the original payment."
          end
          allocation
        end
      end
    end
  end
end
