module Clinic
  module Billing
    class StripeMembershipPayments
      FEE_BASIS_POINTS = 210

      def self.fee_cents(amount)
        cents = Money.currency_amount(amount.to_s, name: "payment", positive: true) * 100
        (cents * FEE_BASIS_POINTS / 10_000).round(0, BigDecimal::ROUND_HALF_UP).to_i
      end

      def self.start(agreement:, actor:, request_key:, gateway: StripeGateway.new)
        Care::SubscriptionAccess.authorize!(agreement: agreement, actor: actor)
        Care::SubscriptionDefinition.request_key(request_key)
        existing = StripeCheckout.find_by(practice: agreement.practice, agreement: agreement)
        if existing&.subscription_id
          return StripeRecurringPayments.payment_url(checkout: existing, actor: actor, gateway: gateway)
        end
        raise StripeGateway::Unavailable, "Stripe sandbox is not configured." unless StripeGateway.configured?
        raise ArgumentError, "Stripe membership checkout currently supports USD only." unless agreement.currency == "USD"
        record = StripeConnect.connection(agreement.practice)
        raise ArgumentError, "The clinic must complete Stripe onboarding first." unless record&.account_id
        account = StripeConnect.verified_account(record, gateway)
        raise ArgumentError, "Stripe has not enabled clinic card payments." unless account.dig("configuration", "merchant", "capabilities", "card_payments", "status") == "active"
        checkout = ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.invoice.lock!
          agreement.lock!
          # One durable attempt per agreement. Reloads and new browser request keys
          # resume that attempt instead of creating a second charge.
          previous = StripeCheckout.find_by(practice: agreement.practice, agreement: agreement)
          next previous if previous
          raise ArgumentError, "Resolve the current payment before starting Stripe." unless %w[pending_payment review_approved payment_failed].include?(agreement.current_state)
          raise ArgumentError, "Reconcile existing invoice activity before payment." unless agreement.invoice.status == "posted" &&
            agreement.invoice.payment_allocations.empty? && agreement.invoice.credit_notes.empty?
          intent = PaymentCollectionIntent.create!(practice: agreement.practice, patient: agreement.patient, invoice: agreement.invoice,
            reference: "ci_#{SecureRandom.hex(16)}", request_key: "stripe:subscription:#{agreement.id}",
            processor: "stripe", mode: "test", currency: agreement.currency, amount: agreement.amount, state: "processing")
          checkout = StripeCheckout.create!(practice: agreement.practice, connection: record, agreement: agreement,
            collection_intent: intent, account_id: record.account_id, application_fee_cents: fee_cents(agreement.amount))
          agreement.events.create!(practice: agreement.practice, kind: "processing", request_key: "intent:#{intent.id}")
          AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "stripe.checkout.requested", outcome: :committed)
          checkout
        end
        checkout.with_lock do
          intent = checkout.collection_intent.reload
          raise ArgumentError, "This payment is already settled. Refresh your membership." if intent.state == "succeeded"
          if checkout.session_id
            session = gateway.request(:get, "/v1/checkout/sessions/#{checkout.session_id}", account: checkout.account_id)
          else
            raise StripeGateway::Unavailable, "Checkout needs operator reconciliation before another attempt." if checkout.created_at < 23.hours.ago
            session = gateway.request(:post, "/v1/checkout/sessions", account: checkout.account_id,
              key: intent.reference, fields: checkout_fields(checkout))
            raise StripeGateway::Invalid, "Stripe returned an invalid checkout session." unless session["id"].to_s.match?(/\Acs_test_[a-zA-Z0-9]+\z/)
            checkout.update!(session_id: session.fetch("id"))
          end
          verify_session!(checkout, session)
          checkout.update!(session_status: session.fetch("status"))
          raise ArgumentError, "This checkout is complete or expired. Ask clinic billing to reconcile it." unless session["status"] == "open"
          StripeGateway.external_url(session.fetch("url"), host: "checkout.stripe.com")
        end
      end

      def self.checkout_fields(checkout)
        intent = checkout.collection_intent
        recurring = checkout.agreement.snapshot["renewal"] == "automatic"
        fields = {
          "mode" => recurring ? "subscription" : "payment",
          "integration_identifier" => "apply_memberships_#{Digest::SHA256.hexdigest(intent.reference).first(8).tr('0-9', 'a-j')}",
          "line_items[0][price_data][currency]" => intent.currency.downcase,
          "line_items[0][price_data][unit_amount]" => (intent.amount * 100).to_i.to_s,
          # No clinical package names, patient identities or treatment details leave APPly.
          "line_items[0][price_data][product_data][name]" => "Clinic membership",
          "line_items[0][quantity]" => "1", "metadata[apply_collection_intent]" => intent.reference,
          "success_url" => StripeGateway.return_url("/patient-portal?stripe_payment=return"),
          "cancel_url" => StripeGateway.return_url("/patient-portal?stripe_payment=cancel")
        }
        if recurring
          terms = checkout.agreement.snapshot
          raise ArgumentError, "Automatic membership terms must renew monthly." unless terms["duration_unit"] == "months" && terms["duration"] == 1
          fields["line_items[0][price_data][recurring][interval]"] = "month"
          fields["line_items[0][price_data][recurring][interval_count]"] = "1"
          fields["subscription_data[application_fee_percent]"] = "2.1"
          fields["subscription_data[metadata][apply_collection_intent]"] = intent.reference
        else
          fields["payment_intent_data[metadata][apply_collection_intent]"] = intent.reference
          fields["payment_intent_data[application_fee_amount]"] = checkout.application_fee_cents.to_s if checkout.application_fee_cents.positive?
        end
        fields
      end

      def self.verify_session!(checkout, session)
        intent = checkout.collection_intent
        raise StripeGateway::Invalid, "Stripe checkout does not match the purchase." unless
          session["id"] == checkout.session_id && session["livemode"] == false && session["mode"] == (checkout.agreement.snapshot["renewal"] == "automatic" ? "subscription" : "payment") &&
          session["amount_total"] == (intent.amount * 100).to_i && session["currency"] == intent.currency.downcase &&
          session.dig("metadata", "apply_collection_intent") == intent.reference
      end

      def self.webhook(raw_body:, signature_header:, gateway: StripeGateway.new)
        raise StripeGateway::Unavailable, "Stripe sandbox is not configured." unless StripeGateway.configured?
        ProcessorWebhookVerifier::Stripe.verify!(raw_body: raw_body, signature_header: signature_header,
          secret: StripeGateway.configuration.fetch("STRIPE_CONNECT_WEBHOOK_SECRET"))
        payload = JSON.parse(raw_body)
        raise StripeGateway::Invalid, "Invalid Stripe event." unless payload.is_a?(Hash) && payload["livemode"] == false
        if payload["type"] == "charge.refunded"
          return StripeRecurringPayments.refund_webhook(payload, gateway: gateway)
        end
        if %w[invoice.paid invoice.payment_failed invoice.payment_action_required customer.subscription.updated customer.subscription.deleted].include?(payload["type"])
          return StripeRecurringPayments.webhook(payload, gateway: gateway)
        end
        return unless %w[checkout.session.completed checkout.session.async_payment_succeeded checkout.session.async_payment_failed checkout.session.expired].include?(payload["type"])
        session = payload.dig("data", "object")
        raise StripeGateway::Invalid, "Invalid Stripe session." unless session.is_a?(Hash)
        record = StripeConnection.find_by(account_id: payload.fetch("account"))
        return unless record
        intent = PaymentCollectionIntent.find_by(practice: record.practice, processor: "stripe", mode: "test",
          reference: session.dig("metadata", "apply_collection_intent"))
        return unless intent
        checkout = StripeCheckout.find_by!(practice: record.practice, collection_intent: intent, account_id: record.account_id)
        # The POST response can be lost after Stripe creates a session. A verified
        # event can recover its identity using the immutable opaque correlation.
        checkout.with_lock { checkout.update!(session_id: session.fetch("id")) unless checkout.session_id }
        verify_session!(checkout, session)
        reconcile(checkout: checkout, actor: record.connected_by, gateway: gateway, verified_webhook: true)
      rescue JSON::ParserError, KeyError
        raise StripeGateway::Invalid, "Invalid Stripe event."
      end

      def self.reconcile(checkout:, actor:, gateway: StripeGateway.new, verified_webhook: false)
        Care::SubscriptionAccess.authorize!(agreement: checkout.agreement, actor: actor) unless verified_webhook
        raise StripeGateway::Unavailable, "Stripe session identity needs operator recovery." unless checkout.session_id
        session = gateway.request(:get, "/v1/checkout/sessions/#{checkout.session_id}", account: checkout.account_id)
        verify_session!(checkout, session)
        checkout.with_lock { checkout.update!(session_status: session.fetch("status")) }
        if checkout.agreement.snapshot["renewal"] == "automatic"
          if session["subscription"] || checkout.subscription_id
            return StripeRecurringPayments.sync(checkout: checkout, actor: actor, session: session, gateway: gateway)
          end
          expire_unpaid(checkout, actor) if session["status"] == "expired"
          return checkout.agreement
        end
        # A declined card can still be retried in the same open Checkout session.
        # Never mark it terminal and allow a second payment while that URL is usable.
        unless session["payment_status"] == "paid"
          expire_unpaid(checkout, actor) if session["status"] == "expired"
          if session["status"] == "complete" && session["payment_intent"].to_s.match?(/\Api_[a-zA-Z0-9]+\z/)
            pending_payment = gateway.request(:get, "/v1/payment_intents/#{session['payment_intent']}", account: checkout.account_id)
            if pending_payment["livemode"] == false && pending_payment["status"] == "canceled"
              expire_unpaid(checkout, actor)
            elsif %w[requires_payment_method requires_action].include?(pending_payment["status"])
              checkout.collection_intent.with_lock do
                intent = checkout.collection_intent
                intent.transition_to!("needs_reconciliation") if intent.state == "processing"
              end
            end
          end
          return checkout.agreement
        end
        payment_id = session["payment_intent"].to_s
        raise StripeGateway::Invalid, "Stripe payment identity is invalid." unless payment_id.match?(/\Api_[a-zA-Z0-9]+\z/)
        payment = gateway.request(:get, "/v1/payment_intents/#{payment_id}", account: checkout.account_id)
        intent = checkout.collection_intent
        raise StripeGateway::Invalid, "Stripe payment does not match the purchase or fee." unless
          payment["id"] == payment_id && payment["livemode"] == false && payment["status"] == "succeeded" &&
          payment["amount_received"] == (intent.amount * 100).to_i && payment["amount"] == (intent.amount * 100).to_i &&
          payment["currency"] == intent.currency.downcase && payment["application_fee_amount"].to_i == checkout.application_fee_cents &&
          payment.dig("metadata", "apply_collection_intent") == intent.reference
        charge_id = payment["latest_charge"].to_s
        raise StripeGateway::Invalid, "Stripe payment has no successful charge." unless charge_id.match?(/\Ach_[a-zA-Z0-9]+\z/)
        charge = gateway.request(:get, "/v1/charges/#{charge_id}", account: checkout.account_id)
        raise StripeGateway::Invalid, "Stripe charge does not match the payment." unless charge["id"] == charge_id &&
          charge["livemode"] == false && charge["payment_intent"] == payment_id && charge["status"] == "succeeded" && charge["paid"] == true
        agreement = checkout.agreement
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.invoice.lock!
          agreement.lock!
          intent.lock!
          next agreement if intent.state == "succeeded"
          raise ArgumentError, "Invoice activity needs clinic reconciliation." unless %w[processing outcome_unknown].include?(agreement.current_state) &&
            agreement.invoice.payment_allocations.empty? && agreement.invoice.credit_notes.empty?
          allocation = record_verified_payment(checkout: checkout, invoice: agreement.invoice, payment_id: payment_id,
            paid_at: Time.at(Integer(charge.fetch("created"))).utc)
          starts_at = allocation.payment_event.created_at
          terms = agreement.snapshot
          ends_at = terms["duration_unit"] == "months" ? starts_at.advance(months: terms["duration"]) : starts_at.advance(days: terms["duration"])
          agreement.events.create!(practice: agreement.practice, kind: "active", request_key: "stripe:#{intent.id}:paid",
            details: { starts_at: starts_at.iso8601, ends_at: ends_at.iso8601, payment_event_id: allocation.payment_event_id,
              application_fee_cents: checkout.application_fee_cents, processor: "stripe" })
          intent.transition_to!("succeeded")
          BillingReceipt.create!(practice: agreement.practice, patient: agreement.patient, invoice: agreement.invoice,
            payment_event: allocation.payment_event, issued_by: actor, kind: "subscription_payment", issued_at: starts_at,
            payload: { amount: intent.amount.to_s("F"), currency: intent.currency, subscription_id: agreement.id })
          AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "stripe.payment.reconciled", outcome: :committed,
            resource_version_ref: "collection_intent:#{intent.id}")
          agreement
        end
        StripeRecurringPayments.apply_refund(checkout: checkout, charge: charge, actor: actor)
        agreement
      end

      # Internal ledger application, reached only after signed routing and fresh
      # provider amount/fee/payment validation. A former onboarding user's role
      # change must not prevent already-authorized renewals being recorded.
      def self.record_verified_payment(checkout:, invoice:, payment_id:, paid_at:)
        agreement = checkout.agreement
        raise StripeGateway::Invalid, "Payment invoice scope does not match." unless
          invoice.practice_id == agreement.practice_id && invoice.patient_id == agreement.patient_id &&
          invoice.currency == agreement.currency && invoice.status == "posted" &&
          invoice.lines.sum(:posted_amount) == agreement.amount
        payment = PaymentEvent.find_or_create_by!(practice: agreement.practice,
          external_event_reference: "stripe:#{checkout.account_id}:#{payment_id}") do |event|
          event.patient = agreement.patient
          event.currency = agreement.currency
          event.amount = agreement.amount
          event.created_at = paid_at
          event.updated_at = paid_at
        end
        payment.lock!
        raise StripeGateway::Invalid, "Stripe payment has conflicting ledger activity." unless
          payment.patient_id == agreement.patient_id && payment.amount == agreement.amount && payment.currency == agreement.currency &&
          payment.allocations.empty? && invoice.payment_allocations.empty? && invoice.credit_notes.empty?
        payment.allocations.create!(practice: agreement.practice, patient: agreement.patient, invoice: invoice,
          amount: agreement.amount, created_at: paid_at, updated_at: paid_at)
      end

      def self.expire_unpaid(checkout, actor)
        agreement = checkout.agreement
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.invoice.lock!
          agreement.lock!
          next if agreement.events.exists?(kind: "active") || agreement.events.exists?(request_key: "stripe:expired")
          raise StripeGateway::Invalid, "Expired checkout has ledger activity." unless agreement.invoice.payment_allocations.empty? && agreement.invoice.credit_notes.empty?
          agreement.events.create!(practice: agreement.practice, kind: "canceled", request_key: "stripe:expired", details: { effective_at: Time.current.iso8601 })
          agreement.invoice.transition_to!("void") if agreement.invoice.status == "posted"
          intent = checkout.collection_intent.reload
          intent.transition_to!("failed") if %w[processing needs_reconciliation].include?(intent.state)
          AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "stripe.checkout.expired", outcome: :committed)
        end
      end
    end
  end
end
