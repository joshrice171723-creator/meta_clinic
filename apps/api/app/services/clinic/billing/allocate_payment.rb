module Clinic
  module Billing
    class AllocatePayment
      def self.call(practice:, actor:, patient:, invoice:, external_event_reference:, currency:, amount:, payment_amount: nil)
        Authorization.authorize_with_legacy!(actor: actor, practice: practice, action: "billing.payment_record", legacy_action: "billing.write")
        patient = practice.patients.find(patient.id)
        invoice = practice.invoices.find(invoice.id)
        allocation_amount = Money.decimal(amount, name: "allocation", positive: true)
        payment_amount = Money.decimal(payment_amount || amount, name: "payment", positive: true)
        raise ArgumentError, "The invoice must be posted before payment allocation." unless invoice.status == "posted"
        raise ArgumentError, "The invoice must belong to the selected patient." unless invoice.patient_id == patient.id
        raise ArgumentError, "Payment currency must match the invoice currency." unless currency.to_s == invoice.currency

        ApplicationRecord.transaction do
          # A patient owns both sides of the allocation. Lock that stable parent
          # before invoice/payment rows, including when no allocation exists yet.
          patient.lock!
          invoice.lock!
          raise ArgumentError, "The invoice must be posted before payment allocation." unless invoice.status == "posted"
          payment = Clinic::PaymentEvent.lock.find_or_create_by!(practice: practice, external_event_reference: external_event_reference) do |event|
            event.patient = patient
            event.currency = currency
            event.amount = payment_amount
          end
          raise ArgumentError, "Payment event details do not match the original event." unless payment.patient_id == patient.id && payment.currency == currency && payment.amount == payment_amount

          existing = payment.allocations.find_by(invoice: invoice)
          if existing
            raise ArgumentError, "Payment allocation details do not match the original event." unless existing.amount == allocation_amount
            return existing
          end
          allocated = payment.allocations.lock.to_a.sum { |allocation| allocation.amount }
          raise ArgumentError, "Payment cannot be allocated more than once." if allocated + allocation_amount > payment.amount
          raise ArgumentError, "Invoice currency does not match the payment currency." unless payment.currency == invoice.currency
          invoice_total = invoice.lines.sum(:posted_amount)
          invoice_allocated = invoice.payment_allocations.lock.to_a.sum { |allocation| allocation.amount }
          raise ArgumentError, "Invoice cannot be allocated more than its posted total." if invoice_allocated + allocation_amount > invoice_total

          payment.allocations.create!(practice: practice, patient: patient, invoice: invoice, amount: allocation_amount)
        end
      end
    end
  end
end
