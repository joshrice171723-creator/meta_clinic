module Clinic
  module Billing
    class AllocatePayment
      def self.call(practice:, actor:, patient:, invoice:, external_event_reference:, currency:, amount:, payment_amount: nil)
        Authorization.authorize!(actor: actor, practice: practice, action: "billing.write")
        patient = practice.patients.find(patient.id)
        invoice = practice.invoices.find(invoice.id)
        allocation_amount = Money.decimal(amount, name: "allocation", positive: true)
        payment_amount = Money.decimal(payment_amount || amount, name: "payment", positive: true)
        raise ArgumentError, "The invoice must be posted before payment allocation." unless invoice.status == "posted"
        raise ArgumentError, "The invoice must belong to the selected patient." unless invoice.patient_id == patient.id
        raise ArgumentError, "Payment currency must match the invoice currency." unless currency.to_s == invoice.currency

        ApplicationRecord.transaction do
          payment = Clinic::PaymentEvent.lock.find_or_create_by!(practice: practice, external_event_reference: external_event_reference) do |event|
            event.patient = patient
            event.currency = currency
            event.amount = payment_amount
          end
          raise ArgumentError, "Payment event details do not match the original event." unless payment.patient_id == patient.id && payment.currency == currency && payment.amount == payment_amount

          allocated = payment.allocations.lock.to_a.sum { |allocation| allocation.amount }
          raise ArgumentError, "Payment cannot be allocated more than once." if allocated + allocation_amount > payment.amount
          raise ArgumentError, "Invoice currency does not match the payment currency." unless payment.currency == invoice.currency
          invoice_total = invoice.lines.sum(:posted_amount)
          invoice_allocated = invoice.payment_allocations.lock.to_a.sum { |allocation| allocation.amount }
          raise ArgumentError, "Invoice cannot be allocated more than its posted total." if invoice_allocated + allocation_amount > invoice_total

          payment.allocations.create!(practice: practice, patient: patient, invoice: invoice, amount: allocation_amount)
        end
      rescue ActiveRecord::RecordNotUnique
        Clinic::PaymentEvent.find_by!(practice: practice, external_event_reference: external_event_reference)
      end
    end
  end
end
