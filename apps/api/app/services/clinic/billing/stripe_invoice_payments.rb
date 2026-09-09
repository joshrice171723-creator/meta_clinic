require "digest"

module Clinic
  module Billing
    class StripeInvoicePayments
      Result = Data.define(:checkout, :state, :checkout_url)
      EVENT_TYPES = %w[
        checkout.session.completed
        checkout.session.async_payment_succeeded
        checkout.session.async_payment_failed
        checkout.session.expired
      ].freeze

      def self.start(invoice:, actor:, request_key:, gateway: StripeGateway.new)
        actor_kind = authorize!(invoice, actor)
        request_key = validated_request_key(request_key)
        raise StripeGateway::Unavailable, "Stripe sandbox is not configured." unless StripeGateway.configured?

        connection = StripeConnect.connection(invoice.practice)
        raise ArgumentError, "The clinic must complete Stripe onboarding first." unless connection&.account_id
        account = StripeConnect.verified_account(connection, gateway)
        unless account.dig("configuration", "merchant", "capabilities", "card_payments", "status") == "active"
          raise ArgumentError, "Stripe has not enabled clinic card payments."
        end

        checkout = ApplicationRecord.transaction do
          invoice.practice.lock!
          invoice.patient.lock!
          current = invoice.practice.invoices.lock.find(invoice.id)
          reject_membership_invoice!(current)
          existing = InvoiceStripeCheckout.active.where(practice: current.practice, invoice: current).order(id: :desc).first
          next existing if existing

          amount = outstanding_balance(current)
          raise ArgumentError, "Only a posted invoice with a balance can be paid online." unless current.status == "posted" && amount.positive?
          raise ArgumentError, "Online invoice payment currently supports USD only." unless current.currency == "USD"

          prior_intent = current.practice.payment_collection_intents.lock.find_by(request_key: request_key)
          if prior_intent
            unless prior_intent.invoice_id == current.id && prior_intent.patient_id == current.patient_id &&
              prior_intent.processor == "stripe" && prior_intent.mode == "test" &&
              prior_intent.currency == current.currency && prior_intent.amount == amount
              raise CreateCollectionIntent::IdempotencyConflict,
                "That collection request key was already used for different details."
            end
            prior_checkout = prior_intent.invoice_stripe_checkout
            raise StripeGateway::Invalid, "The original online payment attempt is incomplete." unless prior_checkout
            next prior_checkout
          end

          intent = current.payment_collection_intents.create!(
            practice: current.practice, patient: current.patient,
            reference: "ci_#{SecureRandom.hex(16)}", request_key: request_key,
            processor: "stripe", mode: "test", currency: current.currency,
            amount: amount, state: "processing"
          )
          record = InvoiceStripeCheckout.create!(
            practice: current.practice, connection: connection, invoice: current,
            collection_intent: intent, account_id: connection.account_id,
            application_fee_cents: StripeMembershipPayments.fee_cents(amount)
          )
          AuditRecorder.record!(practice: current.practice, actor: actor,
            action_code: "stripe.invoice_checkout.requested", outcome: :committed,
            resource_version_ref: "collection_intent:#{intent.id}")
          record
        end

        checkout.with_lock do
          intent = checkout.collection_intent.reload
          raise ArgumentError, "This invoice payment is already settled." if intent.state == "succeeded"
          if %w[failed canceled].include?(intent.state)
            raise ArgumentError, "That online payment attempt ended. Start again with a new request."
          end
          session = checkout.session_id ? retrieve_session(checkout, gateway) : create_or_recover_session(checkout, actor_kind, gateway)
          verify_session!(checkout, session)
          checkout.update!(session_status: session.fetch("status"))
          unless session["status"] == "open" && session["payment_status"] == "unpaid"
            return reconcile(checkout: checkout, actor: actor, gateway: gateway)
          end

          Result.new(checkout: checkout, state: "processing",
            checkout_url: StripeGateway.external_url(session.fetch("url"), host: "checkout.stripe.com"))
        end
      end

      def self.reconcile(checkout:, actor:, gateway: StripeGateway.new, verified_webhook: false)
        authorize!(checkout.invoice, actor) unless verified_webhook
        raise StripeGateway::Unavailable, "Stripe session identity needs operator recovery." unless checkout.session_id

        session = retrieve_session(checkout, gateway)
        checkout.with_lock { checkout.update!(session_status: session.fetch("status")) }
        return apply_paid(checkout, session, actor, gateway) if session["payment_status"] == "paid"
        raise StripeGateway::Invalid, "Stripe returned an unsupported payment state." unless session["payment_status"] == "unpaid"

        if session["status"] == "expired"
          transition_terminal!(checkout, "failed", actor, "stripe.invoice_checkout.expired")
          return Result.new(checkout: checkout, state: "failed", checkout_url: nil)
        end

        if session["status"] == "complete"
          mark_reconciliation!(checkout)
          return Result.new(checkout: checkout, state: "needs_reconciliation", checkout_url: nil)
        end

        Result.new(checkout: checkout, state: "processing", checkout_url: nil)
      end

      def self.cancel(checkout:, actor:, request_key:, gateway: StripeGateway.new)
        actor_kind = authorize!(checkout.invoice, actor)
        request_key = validated_request_key(request_key)
        session = checkout.session_id ? retrieve_session(checkout, gateway) : create_or_recover_session(checkout, actor_kind, gateway)
        return apply_paid(checkout, session, actor, gateway) if session["payment_status"] == "paid"
        raise StripeGateway::Invalid, "Stripe returned an unsupported payment state." unless session["payment_status"] == "unpaid"

        if session["status"] == "open"
          begin
            session = gateway.request(:post, "/v1/checkout/sessions/#{checkout.session_id}/expire",
              account: checkout.account_id, key: "invoice-checkout-cancel:#{checkout.id}:#{Digest::SHA256.hexdigest(request_key).first(16)}")
          rescue StripeGateway::Unavailable
            session = retrieve_session(checkout, gateway)
          end
          verify_session!(checkout, session)
        end

        if session["status"] == "expired" && session["payment_status"] == "unpaid"
          checkout.with_lock { checkout.update!(session_status: "expired") }
          transition_terminal!(checkout, "canceled", actor, "stripe.invoice_checkout.canceled")
          return Result.new(checkout: checkout, state: "canceled", checkout_url: nil)
        end

        mark_reconciliation!(checkout)
        Result.new(checkout: checkout, state: "needs_reconciliation", checkout_url: nil)
      end

      def self.webhook(payload:, gateway: StripeGateway.new)
        return unless payload.is_a?(Hash) && payload["livemode"] == false
        return refund_webhook(payload, gateway) if payload["type"] == "charge.refunded"
        return unless EVENT_TYPES.include?(payload["type"])

        session = payload.dig("data", "object")
        raise StripeGateway::Invalid, "Invalid Stripe session." unless session.is_a?(Hash)
        connection = StripeConnection.find_by(account_id: payload["account"])
        return unless connection
        intent = PaymentCollectionIntent.find_by(practice: connection.practice, processor: "stripe", mode: "test",
          reference: session.dig("metadata", "apply_collection_intent"))
        return unless intent
        checkout = InvoiceStripeCheckout.find_by(practice: connection.practice, collection_intent: intent,
          account_id: connection.account_id)
        return unless checkout

        checkout.with_lock { checkout.update!(session_id: session.fetch("id")) unless checkout.session_id }
        verify_session!(checkout, session)
        actor = connection.connected_by
        if payload["type"] == "checkout.session.async_payment_failed"
          fresh = retrieve_session(checkout, gateway)
          if fresh["payment_status"] == "paid"
            return apply_paid(checkout, fresh, actor, gateway)
          end
          unless fresh["payment_status"] == "unpaid" && %w[complete expired].include?(fresh["status"])
            mark_reconciliation!(checkout)
            return Result.new(checkout: checkout, state: "needs_reconciliation", checkout_url: nil)
          end
          transition_terminal!(checkout, "failed", actor, "stripe.invoice_checkout.failed")
          return Result.new(checkout: checkout, state: "failed", checkout_url: nil)
        end

        reconcile(checkout: checkout, actor: actor, gateway: gateway, verified_webhook: true)
      rescue KeyError
        raise StripeGateway::Invalid, "Invalid Stripe event."
      end

      def self.refund_webhook(payload, gateway)
        connection = StripeConnection.find_by(account_id: payload["account"])
        return unless connection
        charge_id = payload.dig("data", "object", "id").to_s
        raise StripeGateway::Invalid, "Invalid Stripe charge identity." unless charge_id.match?(/\Ach_[a-zA-Z0-9]+\z/)

        charge = gateway.request(:get, "/v1/charges/#{charge_id}", account: connection.account_id)
        payment_id = charge["payment_intent"].to_s
        raise StripeGateway::Invalid, "Invalid Stripe payment identity." unless payment_id.match?(/\Api_[a-zA-Z0-9]+\z/)
        provider_payment = gateway.request(:get, "/v1/payment_intents/#{payment_id}", account: connection.account_id)
        intent = PaymentCollectionIntent.find_by(practice: connection.practice, processor: "stripe", mode: "test",
          reference: provider_payment.dig("metadata", "apply_collection_intent"))
        return unless intent
        checkout = InvoiceStripeCheckout.find_by(practice: connection.practice, account_id: connection.account_id,
          collection_intent: intent)
        return unless checkout
        payment = PaymentEvent.find_by(practice: connection.practice,
          external_event_reference: "stripe:#{connection.account_id}:#{payment_id}")
        raise StripeGateway::Unavailable, "Reconcile the original payment before this refund." unless payment

        apply_refund(checkout: checkout, payment: payment, provider_payment: provider_payment, charge: charge,
          expected_charge_id: charge_id, actor: connection.connected_by)
      end
      private_class_method :refund_webhook

      def self.apply_refund(checkout:, payment:, provider_payment:, charge:, expected_charge_id:, actor:)
        intent = checkout.collection_intent
        amount_cents = (intent.amount * 100).to_i
        payment_id = payment.external_event_reference.split(":").last
        unless charge["id"] == expected_charge_id && charge["livemode"] == false && charge["payment_intent"] == payment_id &&
          charge["status"] == "succeeded" && charge["paid"] == true && charge["amount"] == amount_cents &&
          charge["currency"] == intent.currency.downcase && charge["amount_refunded"].is_a?(Integer) &&
          charge["amount_refunded"].between?(0, amount_cents) && provider_payment["id"] == payment_id &&
          provider_payment["livemode"] == false && provider_payment["status"] == "succeeded" &&
          provider_payment["amount"] == amount_cents && provider_payment["currency"] == intent.currency.downcase &&
          provider_payment["latest_charge"] == expected_charge_id &&
          provider_payment.dig("metadata", "apply_collection_intent") == intent.reference
          raise StripeGateway::Invalid, "Stripe refund charge does not match the invoice."
        end
        return payment if charge["amount_refunded"].zero?

        ApplicationRecord.transaction do
          invoice = checkout.invoice
          invoice.practice.lock!
          invoice.patient.lock!
          invoice.lock!
          payment.lock!
          unless payment.patient_id == invoice.patient_id && payment.currency == intent.currency && payment.amount == intent.amount &&
            payment.allocations.exists?(invoice: invoice)
            raise StripeGateway::Invalid, "Stripe refund has conflicting ledger activity."
          end
          total = BigDecimal(charge["amount_refunded"].to_s) / 100
          remaining = total - payment.refund_events.sum(:amount)
          raise StripeGateway::Invalid, "Stripe refund total moved backwards." if remaining.negative?
          next payment unless remaining.positive?

          refund = payment.refund_events.create!(practice: invoice.practice, patient: invoice.patient,
            currency: payment.currency, amount: remaining, reason: "Confirmed Stripe invoice refund")
          AuditRecorder.record!(practice: invoice.practice, actor: actor,
            action_code: "stripe.invoice_refund.observed", outcome: :committed,
            resource_version_ref: "refund:#{refund.id}")
          payment
        end
      end
      private_class_method :apply_refund

      def self.eligibility(invoice:)
        amount = outstanding_balance(invoice)
        return eligibility_result(invoice, "unavailable", false, false, amount, "membership_managed") if membership_invoice?(invoice)
        return eligibility_result(invoice, "unavailable", false, false, amount, "invoice_not_posted") unless invoice.status == "posted"
        return eligibility_result(invoice, "paid", false, false, amount, "no_balance") unless amount.positive?
        return eligibility_result(invoice, "unavailable", false, false, amount, "unsupported_currency") unless invoice.currency == "USD"

        checkout = active_checkout(invoice)
        if checkout
          state = checkout.collection_intent.state == "needs_reconciliation" ? "needs_reconciliation" : "processing"
          reason = state == "needs_reconciliation" ? "provider_reconciliation_required" : "checkout_active"
          return eligibility_result(invoice, state, false, true, amount, reason)
        end
        unless StripeConnect.patient_checkout_available?(invoice.practice)
          return eligibility_result(invoice, "unavailable", false, false, amount, "stripe_unavailable")
        end

        eligibility_result(invoice, "available", true, false, amount, nil)
      end

      def self.apply_paid(checkout, session, actor, gateway)
        payment_id = session["payment_intent"].to_s
        raise StripeGateway::Invalid, "Stripe payment identity is invalid." unless payment_id.match?(/\Api_[a-zA-Z0-9]+\z/)
        payment = gateway.request(:get, "/v1/payment_intents/#{payment_id}", account: checkout.account_id)
        intent = checkout.collection_intent
        amount_cents = (intent.amount * 100).to_i
        unless payment["id"] == payment_id && payment["livemode"] == false && payment["status"] == "succeeded" &&
          payment["amount_received"] == amount_cents && payment["amount"] == amount_cents &&
          payment["currency"] == intent.currency.downcase && payment["application_fee_amount"].to_i == checkout.application_fee_cents &&
          payment.dig("metadata", "apply_collection_intent") == intent.reference
          raise StripeGateway::Invalid, "Stripe payment does not match the invoice or fee."
        end
        charge_id = payment["latest_charge"].to_s
        raise StripeGateway::Invalid, "Stripe payment has no successful charge." unless charge_id.match?(/\Ach_[a-zA-Z0-9]+\z/)
        charge = gateway.request(:get, "/v1/charges/#{charge_id}", account: checkout.account_id)
        unless charge["id"] == charge_id && charge["livemode"] == false && charge["payment_intent"] == payment_id &&
          charge["status"] == "succeeded" && charge["paid"] == true
          raise StripeGateway::Invalid, "Stripe charge does not match the payment."
        end

        ApplicationRecord.transaction do
          invoice = checkout.invoice
          invoice.practice.lock!
          invoice.patient.lock!
          invoice.lock!
          intent.lock!
          next if intent.state == "succeeded"

          paid_at = Time.at(Integer(charge.fetch("created"))).utc
          ledger_payment = PaymentEvent.find_or_create_by!(practice: invoice.practice,
            external_event_reference: "stripe:#{checkout.account_id}:#{payment_id}") do |event|
            event.patient = invoice.patient
            event.currency = intent.currency
            event.amount = intent.amount
            event.created_at = paid_at
            event.updated_at = paid_at
          end
          ledger_payment.lock!
          unless ledger_payment.patient_id == invoice.patient_id && ledger_payment.currency == intent.currency && ledger_payment.amount == intent.amount
            raise StripeGateway::Invalid, "Stripe payment has conflicting ledger activity."
          end

          existing = ledger_payment.allocations.find_by(invoice: invoice)
          remaining = outstanding_balance(invoice)
          allocated_amount = existing&.amount || [ intent.amount, remaining ].min
          if existing
            raise StripeGateway::Invalid, "Stripe allocation has conflicting ledger activity." if existing.amount > intent.amount
          elsif allocated_amount.positive?
            ledger_payment.allocations.create!(practice: invoice.practice, patient: invoice.patient,
              invoice: invoice, amount: allocated_amount, created_at: paid_at, updated_at: paid_at)
          end
          unapplied = intent.amount - allocated_amount
          BillingReceipt.find_or_create_by!(practice: invoice.practice, payment_event: ledger_payment,
            invoice: invoice, kind: "card_payment") do |receipt|
            receipt.patient = invoice.patient
            receipt.issued_by = checkout.connection.connected_by
            receipt.issued_at = paid_at
            receipt.payload = { amount: intent.amount.to_s("F"), allocated_amount: allocated_amount.to_s("F"),
              unapplied_amount: unapplied.to_s("F"), currency: intent.currency }
          end
          intent.transition_to!("succeeded")
          AuditRecorder.record!(practice: invoice.practice, actor: actor,
            action_code: "stripe.invoice_payment.reconciled", outcome: :committed,
            resource_version_ref: "collection_intent:#{intent.id}")
        end
        ledger_payment ||= PaymentEvent.find_by(practice: checkout.practice,
          external_event_reference: "stripe:#{checkout.account_id}:#{payment_id}")
        raise StripeGateway::Unavailable, "Reconcile the original payment before this refund." unless ledger_payment

        apply_refund(checkout: checkout, payment: ledger_payment, provider_payment: payment, charge: charge,
          expected_charge_id: charge_id, actor: actor)
        Result.new(checkout: checkout, state: "paid", checkout_url: nil)
      rescue ArgumentError, KeyError
        raise StripeGateway::Invalid, "Stripe payment evidence is invalid."
      end
      private_class_method :apply_paid

      def self.create_or_recover_session(checkout, actor_kind, gateway)
        if checkout.created_at < 23.hours.ago
          checkout.collection_intent.with_lock do
            intent = checkout.collection_intent
            intent.transition_to!("needs_reconciliation") if intent.state == "processing"
          end
          raise StripeGateway::Unavailable, "Checkout needs operator reconciliation before another attempt."
        end
        session = gateway.request(:post, "/v1/checkout/sessions", account: checkout.account_id,
          key: checkout.collection_intent.reference, fields: checkout_fields(checkout, actor_kind))
        unless session["id"].to_s.match?(/\Acs_test_[a-zA-Z0-9]+\z/)
          raise StripeGateway::Invalid, "Stripe returned an invalid checkout session."
        end
        checkout.update!(session_id: session.fetch("id"))
        session
      end
      private_class_method :create_or_recover_session

      def self.checkout_fields(checkout, actor_kind)
        intent = checkout.collection_intent
        surface = actor_kind == :staff ? "/clinic/billing" : "/patient-portal"
        fields = {
          "mode" => "payment",
          "integration_identifier" => "apply_invoices_#{Digest::SHA256.hexdigest(intent.reference).first(8).tr('0-9', 'a-j')}",
          "line_items[0][price_data][currency]" => intent.currency.downcase,
          "line_items[0][price_data][unit_amount]" => (intent.amount * 100).to_i.to_s,
          "line_items[0][price_data][product_data][name]" => "Clinic balance payment",
          "line_items[0][quantity]" => "1",
          "metadata[apply_collection_intent]" => intent.reference,
          "payment_intent_data[metadata][apply_collection_intent]" => intent.reference,
          "success_url" => StripeGateway.return_url("#{surface}?invoice_payment=return"),
          "cancel_url" => StripeGateway.return_url("#{surface}?invoice_payment=cancel")
        }
        if checkout.application_fee_cents.positive?
          fields["payment_intent_data[application_fee_amount]"] = checkout.application_fee_cents.to_s
        end
        fields
      end
      private_class_method :checkout_fields

      def self.retrieve_session(checkout, gateway)
        session = gateway.request(:get, "/v1/checkout/sessions/#{checkout.session_id}", account: checkout.account_id)
        verify_session!(checkout, session)
        session
      end
      private_class_method :retrieve_session

      def self.verify_session!(checkout, session)
        intent = checkout.collection_intent
        unless session["id"] == checkout.session_id && session["livemode"] == false && session["mode"] == "payment" &&
          session["amount_total"] == (intent.amount * 100).to_i && session["currency"] == intent.currency.downcase &&
          session.dig("metadata", "apply_collection_intent") == intent.reference &&
          %w[open complete expired].include?(session["status"])
          raise StripeGateway::Invalid, "Stripe checkout does not match the invoice."
        end
      end

      def self.transition_terminal!(checkout, target, actor, action_code)
        ApplicationRecord.transaction do
          checkout.invoice.practice.lock!
          checkout.invoice.patient.lock!
          checkout.invoice.lock!
          checkout.collection_intent.lock!
          intent = checkout.collection_intent
          next unless %w[processing needs_reconciliation].include?(intent.state)

          intent.transition_to!(target)
          AuditRecorder.record!(practice: checkout.practice, actor: actor,
            action_code: action_code, outcome: :committed,
            resource_version_ref: "collection_intent:#{intent.id}")
        end
      end
      private_class_method :transition_terminal!

      def self.mark_reconciliation!(checkout)
        checkout.collection_intent.with_lock do
          intent = checkout.collection_intent
          intent.transition_to!("needs_reconciliation") if intent.state == "processing"
        end
      end
      private_class_method :mark_reconciliation!

      def self.authorize!(invoice, actor)
        Authorization.authorize_with_legacy!(actor: actor, practice: invoice.practice,
          action: "billing.payment_record", legacy_action: "billing.write")
        :staff
      rescue Authorization::Denied, CanCan::AccessDenied
        identity = PatientPortal::Identity.available.find_by(
          practice: invoice.practice, patient: invoice.patient, user: actor
        )
        raise Authorization::Denied unless identity

        :patient
      end
      private_class_method :authorize!

      def self.validated_request_key(value)
        key = value.to_s
        raise ArgumentError, "A valid request key is required." unless key.match?(Clinic::Idempotency::KEY_PATTERN)

        key
      end
      private_class_method :validated_request_key

      def self.membership_invoice?(invoice)
        Care::SubscriptionAgreement.where(practice: invoice.practice, invoice: invoice).exists?
      end
      private_class_method :membership_invoice?

      def self.reject_membership_invoice!(invoice)
        raise ArgumentError, "Use the membership payment action for this invoice." if membership_invoice?(invoice)
      end
      private_class_method :reject_membership_invoice!

      def self.outstanding_balance(invoice)
        return BigDecimal("0") unless invoice.status == "posted"

        total = invoice.lines.sum(:posted_amount)
        allocated = invoice.payment_allocations.sum(:amount)
        credited = invoice.credit_notes.sum(:amount)
        [ total - allocated - credited, BigDecimal("0") ].max
      end
      private_class_method :outstanding_balance

      def self.eligibility_result(invoice, state, eligible, can_cancel, amount, reason)
        { state: state, eligible: eligible, can_cancel: can_cancel,
          amount: amount.to_s("F"), currency: invoice.currency, reason: reason }
      end
      private_class_method :eligibility_result

      def self.active_checkout(invoice)
        association = invoice.association(:invoice_stripe_checkouts)
        if association.loaded?
          checkouts = association.target
          return checkouts.select { |checkout|
            checkout.collection_intent.state.in?(%w[pending processing needs_reconciliation])
          }.max_by(&:id) if
            checkouts.all? { |checkout| checkout.association(:collection_intent).loaded? }
        end

        InvoiceStripeCheckout.active.where(practice: invoice.practice, invoice: invoice).order(id: :desc).first
      end
      private_class_method :active_checkout
    end
  end
end
