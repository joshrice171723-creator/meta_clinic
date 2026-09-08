require "securerandom"

module Clinic
  module Billing
    class CreateCollectionIntent
      class IdempotencyConflict < StandardError; end

      def self.call(practice:, actor:, patient:, invoice:, amount:, request_key:, processor: "stripe", mode: "test")
        Authorization.authorize_with_legacy!(actor: actor, practice: practice,
          action: "billing.payment_record", legacy_action: "billing.write")
        patient = practice.patients.find(patient.id)
        invoice = practice.invoices.find(invoice.id)
        amount = Money.decimal(amount, name: "collection amount", positive: true)
        currency = invoice.currency
        raise ArgumentError, "An invoice must be posted before card collection." unless invoice.status == "posted"
        raise ArgumentError, "The invoice must belong to the selected patient." unless invoice.patient_id == patient.id
        raise ArgumentError, "Live card collection is not enabled." unless mode.to_s == "test"

        ApplicationRecord.transaction do
          invoice.lock!
          existing = practice.payment_collection_intents.lock.find_by(request_key: request_key.to_s)
          if existing
            unless [ existing.patient_id, existing.invoice_id, existing.processor, existing.mode,
              existing.currency, existing.amount ] == [ patient.id, invoice.id, processor.to_s, mode.to_s, currency, amount ]
              raise IdempotencyConflict, "That collection request key was already used for different details."
            end
            next existing
          end

          invoice_total = invoice.lines.sum(:posted_amount)
          allocated = invoice.payment_allocations.sum(:amount)
          credited = invoice.credit_notes.sum(:amount)
          raise ArgumentError, "The collection amount exceeds the invoice balance." if amount > invoice_total - allocated - credited

          practice.payment_collection_intents.create!(
            patient: patient, invoice: invoice, reference: "ci_#{SecureRandom.hex(16)}",
            request_key: request_key, processor: processor, mode: mode, currency: currency,
            amount: amount, state: "pending"
          )
        end
      end
    end
  end
end
