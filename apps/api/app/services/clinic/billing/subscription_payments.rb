require "openssl"

module Clinic
  module Billing
    class SubscriptionPayments
      def self.start(agreement:, actor:, request_key:)
        raise ArgumentError, "Automatic memberships require Stripe Checkout." if agreement.snapshot["renewal"] == "automatic"
        Clinic::Care::SubscriptionAccess.authorize!(agreement: agreement, actor: actor)
        key = Clinic::Care::SubscriptionDefinition.request_key(request_key)
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.invoice.lock!
          agreement.lock!
          intent_key = "subscription:#{agreement.id}:#{key}"
          raise ArgumentError, "Payment request key is too long." if intent_key.length > 160
          existing = PaymentCollectionIntent.find_by(practice: agreement.practice, request_key: intent_key)
          next existing if existing
          state = agreement.current_state
          raise ArgumentError, "This subscription cannot start another payment." unless %w[pending_payment review_approved payment_failed].include?(state)
          raise ArgumentError, "This invoice already has financial activity; ask the clinic to reconcile it." if agreement.invoice.payment_allocations.exists? || agreement.invoice.credit_notes.exists? || agreement.invoice.status != "posted"
          intent = PaymentCollectionIntent.create!(practice: agreement.practice, patient: agreement.patient, invoice: agreement.invoice,
            reference: "ci_#{SecureRandom.hex(16)}", request_key: intent_key, processor: "development_fixture", mode: "test",
            currency: agreement.currency, amount: agreement.amount, state: "pending")
          intent.transition_to!("processing")
          agreement.events.create!(practice: agreement.practice, kind: "processing", request_key: "intent:#{intent.id}")
          AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "subscriptions.payment_requested", outcome: :committed, resource_version_ref: "collection_intent:#{intent.id}")
          intent
        end
      end

      # Only an explicitly selected local fixture provider exists. This is never
      # an incoming browser payment callback or a production processor endpoint.
      def self.deliver_fixture(agreement:, actor:, outcome:, request_key:)
        raise ArgumentError, "The fixture processor is local development only." unless Rails.env.development? || Rails.env.test?
        Authorization.authorize_with_legacy!(practice: agreement.practice, actor: actor, action: "billing.payment_record", legacy_action: "billing.write")
        key = Care::SubscriptionDefinition.request_key(request_key)
        type = { "succeeded" => "payment_intent.succeeded", "failed" => "payment_intent.payment_failed", "unknown" => "payment_intent.unknown" }.fetch(outcome) { raise ArgumentError, "Unknown fixture outcome." }
        intent = PaymentCollectionIntent.where(practice: agreement.practice, invoice: agreement.invoice).order(:id).last!
        secret = SecureRandom.hex(32)
        body = JSON.generate(id: "fixture_#{Digest::SHA256.hexdigest("#{agreement.id}:#{key}")}", type: type,
          livemode: false, account: "development:#{agreement.practice_id}",
          data: { object: { id: "fixture_intent_#{intent.id}", amount: (intent.amount * 100).to_i,
            currency: intent.currency.downcase, metadata: { apply_collection_intent: intent.reference } } })
        timestamp = Time.current.to_i
        signature = OpenSSL::HMAC.hexdigest("SHA256", secret, "#{timestamp}.#{body}")
        reconcile(agreement: agreement, actor: actor, raw_body: body, signature_header: "t=#{timestamp},v1=#{signature}", secret: secret,
          expected_account: "development:#{agreement.practice_id}")
      end

      def self.reconcile(agreement:, actor:, raw_body:, signature_header:, secret:, expected_account:)
        raise ArgumentError, "Subscription processor activation is local development only." unless Rails.env.development? || Rails.env.test?
        Authorization.authorize_with_legacy!(practice: agreement.practice, actor: actor, action: "billing.payment_record", legacy_action: "billing.write")
        ProcessorWebhookVerifier::Stripe.verify!(raw_body: raw_body, signature_header: signature_header, secret: secret)
        payload = JSON.parse(raw_body)
        raise ArgumentError, "Processor account or mode does not match." unless payload["livemode"] == false && expected_account == "development:#{agreement.practice_id}" && payload["account"] == expected_account
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.invoice.lock!
          agreement.lock!
          object = payload.fetch("data").fetch("object")
          intent = PaymentCollectionIntent.where(practice: agreement.practice, invoice: agreement.invoice, processor: "development_fixture", mode: "test").lock.find_by!(reference: object.dig("metadata", "apply_collection_intent"))
          raise ArgumentError, "Processor amount, currency or intent does not match." unless object["amount"].is_a?(Integer) && object["amount"] == (intent.amount * 100).to_i && object["currency"] == intent.currency.downcase && object["id"] == "fixture_intent_#{intent.id}"
          result = IngestProcessorEvent.call(practice: agreement.practice, raw_body: raw_body, signature_header: signature_header, secret: secret, processor: "development_fixture")
          event = result.event
          next agreement if agreement.events.exists?(request_key: "provider:#{event.id}")
          latest_intent_id = PaymentCollectionIntent.where(practice: agreement.practice, invoice: agreement.invoice).maximum(:id)
          unless intent.id == latest_intent_id && %w[processing needs_reconciliation].include?(intent.state)
            AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "subscriptions.stale_payment_event", outcome: :committed, resource_version_ref: "processor_event:#{event.id}")
            next agreement
          end
          if event.normalized_outcome == "succeeded" && %w[processing outcome_unknown].include?(agreement.current_state)
            allocation = AllocatePayment.call(practice: agreement.practice, actor: actor, patient: agreement.patient, invoice: agreement.invoice,
              external_event_reference: "subscription:#{intent.reference}", currency: intent.currency, amount: intent.amount.to_s("F"))
            intent.transition_to!("succeeded")
            starts_at = Current.business_time
            terms = agreement.snapshot
            ends_at = terms["duration_unit"] == "months" ? starts_at.advance(months: terms["duration"]) : starts_at.advance(days: terms["duration"])
            agreement.events.create!(practice: agreement.practice, kind: "active", request_key: "provider:#{event.id}",
              details: { starts_at: starts_at.iso8601, ends_at: ends_at.iso8601, payment_event_id: allocation.payment_event_id })
            BillingReceipt.create!(practice: agreement.practice, patient: agreement.patient, invoice: agreement.invoice,
              payment_event: allocation.payment_event, issued_by: actor, kind: "subscription_payment", issued_at: starts_at,
              payload: { amount: intent.amount.to_s("F"), currency: intent.currency, subscription_id: agreement.id })
          elsif event.normalized_outcome == "failed" && %w[processing outcome_unknown].include?(agreement.current_state)
            intent.transition_to!("failed")
            agreement.events.create!(practice: agreement.practice, kind: "payment_failed", request_key: "provider:#{event.id}")
          elsif !%w[active canceled refunded expired].include?(agreement.current_state)
            intent.transition_to!("needs_reconciliation") if %w[pending processing].include?(intent.state)
            agreement.events.create!(practice: agreement.practice, kind: "outcome_unknown", request_key: "provider:#{event.id}")
          end
          AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "subscriptions.payment_reconciled", outcome: :committed, resource_version_ref: "processor_event:#{event.id}")
          agreement
        end
      rescue JSON::ParserError, KeyError
        raise ArgumentError, "Invalid processor event."
      end

      def self.refund(agreement:, actor:, amount:, request_key:)
        raise ArgumentError, "Stripe refunds must be reviewed in the clinic's Stripe sandbox Dashboard; APPly records confirmed provider refunds." if StripeCheckout.exists?(practice: agreement.practice, agreement: agreement)
        raise ArgumentError, "Fixture refunds are local development only." unless Rails.env.development? || Rails.env.test?
        Authorization.authorize_with_legacy!(practice: agreement.practice, actor: actor, action: "billing.payment_record", legacy_action: "billing.write")
        key = Care::SubscriptionDefinition.request_key(request_key)
        value = Money.currency_amount(amount, positive: true)
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.lock!
          previous = agreement.events.find_by(request_key: key)
          if previous
            raise ArgumentError, "Request key was used for a different refund." unless previous.kind == "refunded" && previous.details["amount"] == value.to_s("F")
            next agreement
          end
          raise ArgumentError, "This package does not allow refunds." if agreement.snapshot["refund_policy"] == "none"
          active = agreement.events.find_by!(kind: "active")
          payment = PaymentEvent.where(practice: agreement.practice, patient: agreement.patient).lock.find(active.details.fetch("payment_event_id"))
          raise ArgumentError, "Use the existing cash refund workflow for cash payments." unless payment.external_event_reference.start_with?("subscription:ci_")
          raise ArgumentError, "This fixture workflow supports a full remaining refund." unless value == payment.amount - payment.refund_events.sum(:amount)
          raise ArgumentError, "Refund exceeds the remaining payment." if payment.refund_events.sum(:amount) + value > payment.amount
          refund_reason = "Subscription refund recorded by clinic staff"
          refund = payment.refund_events.create!(practice: agreement.practice, patient: agreement.patient,
            currency: agreement.currency, amount: value, reason: refund_reason)
          BillingReceipt.create!(practice: agreement.practice, patient: agreement.patient, invoice: agreement.invoice, payment_event: payment,
            issued_by: actor, kind: "subscription_refund", issued_at: Time.current,
            payload: { amount: value.to_s("F"), currency: agreement.currency, refund_id: refund.id, reason: refund_reason })
          agreement.events.create!(practice: agreement.practice, kind: "refunded", request_key: key, details: { amount: value.to_s("F"), refund_id: refund.id })
          AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "subscriptions.refund", outcome: :committed, resource_version_ref: "refund:#{refund.id}")
          agreement
        end
      end

      def self.reconcile_ledger(agreement:, actor:, request_key:)
        raise ArgumentError, "Recurring membership payments must be reconciled with Stripe." if agreement.snapshot["renewal"] == "automatic"
        Authorization.authorize_with_legacy!(practice: agreement.practice, actor: actor, action: "billing.payment_record", legacy_action: "billing.write")
        key = Care::SubscriptionDefinition.request_key(request_key)
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.invoice.lock!
          agreement.lock!
          existing = agreement.events.find_by(request_key: key)
          if existing
            raise ArgumentError, "Request key was used for a different action." unless existing.kind == "active"
            next agreement
          end
          raise ArgumentError, "This subscription cannot be activated from the ledger." unless %w[pending_payment review_approved payment_failed].include?(agreement.current_state)
          invoice = agreement.invoice
          allocations = invoice.payment_allocations.includes(:payment_event).to_a
          raise ArgumentError, "The invoice needs an exact, fully posted payment without refunds or credits." unless invoice.status == "posted" && invoice.credit_notes.empty? && allocations.sum(&:amount) == agreement.amount && allocations.all? { |a| a.payment_event.currency == agreement.currency && a.payment_event.refund_events.empty? }
          starts_at = Current.business_time
          terms = agreement.snapshot
          ends_at = terms["duration_unit"] == "months" ? starts_at.advance(months: terms["duration"]) : starts_at.advance(days: terms["duration"])
          agreement.events.create!(practice: agreement.practice, kind: "active", request_key: key,
            details: { starts_at: starts_at.iso8601, ends_at: ends_at.iso8601, payment_event_id: allocations.first.payment_event_id, source: "posted_ledger" })
          AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "subscriptions.ledger_reconciled", outcome: :committed, resource_version_ref: "subscription:#{agreement.id}")
          agreement
        end
      end
    end
  end
end
