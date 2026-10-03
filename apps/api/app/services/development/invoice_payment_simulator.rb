module Development
  class InvoicePaymentSimulator
    PROCESSOR = "synthetic_invoice"
    OUTCOMES = %w[succeeded failed].freeze

    def self.enabled_for?(practice)
      DemoRun.synthetic_practice?(practice)
    end

    def self.projection(invoice, eligibility:)
      return { enabled: false, eligible: false } unless enabled_for?(invoice.practice)

      { enabled: true, eligible: eligibility[:eligible] || eligibility[:reason] == "stripe_unavailable" }
    end

    def self.collect!(invoice:, actor:, request_key:, amount:, outcome:)
      practice = invoice.practice
      authorize = lambda do
        Clinic::Authorization.authorize_with_legacy!(actor:, practice:,
          action: "billing.payment_record", legacy_action: "billing.write")
        raise ActiveRecord::RecordNotFound unless enabled_for?(practice)
      end
      authorize.call
      raise ArgumentError, "Choose an approved or declined payment outcome." unless OUTCOMES.include?(outcome)
      amount = Clinic::Billing::Money.currency_amount(amount, name: "collection amount", positive: true)
      result = Clinic::Idempotency.execute(
        practice:, actor:, operation_code: "billing.synthetic_invoice.collect", request_key:,
        payload: { invoice_id: invoice.id, amount: amount.to_s("F"), outcome: },
        authorization: authorize, authorization_action: "billing.payment_record",
        result_resource: ->(intent) { intent },
        resource_resolver: ->(practice:, receipt:) {
          practice.payment_collection_intents.find_by(id: receipt.resource_id, processor: PROCESSOR, mode: "test")
        }
      ) do
        invoice.patient.lock!
        invoice.lock!
        eligibility = Clinic::Billing::StripeInvoicePayments.eligibility(invoice:)
        unless projection(invoice, eligibility:)[:eligible] && amount == BigDecimal(eligibility.fetch(:amount))
          raise ArgumentError, "The invoice balance changed or collection is unavailable. Refresh before collecting."
        end
        Clinic::PaymentCollectionIntent.ensure_no_active_invoice_checkout!(invoice)
        intent = Clinic::Billing::CreateCollectionIntent.call(practice:, actor:, patient: invoice.patient,
          invoice:, amount:, request_key:, processor: PROCESSOR, mode: "test")
        intent.transition_to!("processing")
        if outcome == "succeeded"
          allocation = Clinic::Billing::AllocatePayment.call(practice:, actor:, patient: invoice.patient,
            invoice:, external_event_reference: "synthetic-invoice:#{intent.reference}",
            currency: invoice.currency, amount:)
          Clinic::BillingReceipt.create!(practice:, patient: invoice.patient, invoice:,
            payment_event: allocation.payment_event, issued_by: actor, kind: "card_payment",
            issued_at: Current.business_time,
            payload: { source: PROCESSOR, mode: "test", amount: amount.to_s("F"),
              allocated_amount: amount.to_s("F"), unapplied_amount: "0.0", currency: invoice.currency,
              collection_intent_id: intent.id })
        end
        intent.transition_to!(outcome)
        Clinic::AuditRecorder.record!(practice:, actor:, action_code: "billing.synthetic_invoice.#{outcome}",
          outcome: :committed, resource_version_ref: "collection_intent:#{intent.id}")
        intent
      end
      result.value
    end
  end
end
