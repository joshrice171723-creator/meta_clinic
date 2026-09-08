module Clinic
  module Billing
    class StripeRecurringPayments
      def self.webhook(payload, gateway: StripeGateway.new)
        object = payload.dig("data", "object")
        raise StripeGateway::Invalid, "Invalid recurring event." unless object.is_a?(Hash)
        connection = StripeConnection.find_by(account_id: payload.fetch("account"))
        return unless connection
        subscription_id = if payload["type"].start_with?("invoice.")
          object.dig("parent", "subscription_details", "subscription") || object["subscription"]
        else
          object["id"]
        end
        return unless subscription_id
        subscription = fetch_subscription(subscription_id, connection.account_id, gateway)
        intent = PaymentCollectionIntent.find_by(practice: connection.practice, processor: "stripe", mode: "test",
          reference: subscription.dig("metadata", "apply_collection_intent"))
        return unless intent
        checkout = StripeCheckout.find_by!(practice: connection.practice, collection_intent: intent, account_id: connection.account_id)
        sync(checkout: checkout, actor: connection.connected_by, subscription: subscription,
          invoice_id: payload["type"].start_with?("invoice.") ? object["id"] : nil, gateway: gateway)
      end

      def self.fetch_subscription(id, account, gateway)
        raise StripeGateway::Invalid, "Invalid Stripe subscription identity." unless id.to_s.match?(/\Asub_[a-zA-Z0-9]+\z/)
        gateway.request(:get, "/v1/subscriptions/#{id}", account: account)
      end

      def self.sync(checkout:, actor:, session: nil, subscription: nil, invoice_id: nil, gateway: StripeGateway.new)
        subscription ||= fetch_subscription(session&.fetch("subscription", nil) || checkout.subscription_id, checkout.account_id, gateway)
        validate_subscription!(checkout, subscription)
        # Serialize provider reads with status persistence: a later-delivered event
        # retrieves current Stripe state rather than replaying its old status.
        ApplicationRecord.transaction do
          checkout.practice.lock!
          checkout.lock!
          subscription = fetch_subscription(subscription.fetch("id"), checkout.account_id, gateway)
          validate_subscription!(checkout, subscription)
          checkout.update!(subscription_id: subscription.fetch("id"), subscription_status: subscription.fetch("status"),
            cancel_at_period_end: subscription["cancel_at_period_end"] == true, last_synced_at: Time.current)
          invoice_id ||= subscription["latest_invoice"]
          if invoice_id
            raise StripeGateway::Invalid, "Invalid Stripe invoice identity." unless invoice_id.to_s.match?(/\Ain_[a-zA-Z0-9]+\z/)
            invoice = gateway.request(:get, "/v1/invoices/#{invoice_id}", account: checkout.account_id)
            validate_invoice_identity!(checkout, invoice)
            apply_paid_invoice(checkout: checkout, actor: actor, invoice: invoice, gateway: gateway) if invoice["status"] == "paid"
          end
          latest_id = subscription["latest_invoice"]
          if latest_id
            latest = latest_id == invoice_id ? invoice : gateway.request(:get, "/v1/invoices/#{latest_id}", account: checkout.account_id)
            validate_invoice_identity!(checkout, latest)
            checkout.update!(renewal_amount_due: BigDecimal(latest.fetch("amount_remaining").to_s) / 100,
              renewal_invoice_status: latest.fetch("status"))
          end
          StripeMembershipPayments.expire_unpaid(checkout, actor) if subscription["status"] == "incomplete_expired"
        end
        AuditRecorder.record!(practice: checkout.practice, actor: actor, action_code: "stripe.subscription.checked", outcome: :committed,
          resource_version_ref: "collection_intent:#{checkout.collection_intent_id}")
        checkout.agreement
      end

      def self.validate_subscription!(checkout, subscription)
        terms = checkout.agreement.snapshot
        items = subscription.dig("items", "data")
        price = items&.first&.fetch("price", nil)
        raise StripeGateway::Invalid, "Stripe recurring terms do not match this membership." unless
          terms["renewal"] == "automatic" && subscription["livemode"] == false &&
          (!checkout.subscription_id || subscription["id"] == checkout.subscription_id) &&
          subscription.dig("metadata", "apply_collection_intent") == checkout.collection_intent.reference &&
          subscription["application_fee_percent"].to_s.in?(["2.1", "2.10"]) &&
          items.is_a?(Array) && items.one? && subscription.dig("items", "has_more") == false && items.first["quantity"] == 1 &&
          price.is_a?(Hash) && price["unit_amount"] == (checkout.agreement.amount * 100).to_i && price["currency"] == "usd" &&
          terms["duration_unit"] == "months" && terms["duration"] == 1 &&
          price.dig("recurring", "interval") == "month" && price.dig("recurring", "interval_count") == 1 &&
          subscription["collection_method"] == "charge_automatically" && subscription["trial_end"].nil? &&
          subscription["pause_collection"].nil? && subscription["discounts"].to_a.empty?
      end

      def self.validate_invoice_identity!(checkout, invoice)
        raise StripeGateway::Invalid, "Stripe invoice does not match this membership." unless
          invoice["livemode"] == false && invoice.dig("parent", "subscription_details", "subscription") == checkout.subscription_id &&
          invoice["currency"] == checkout.agreement.currency.downcase
      end

      def self.apply_paid_invoice(checkout:, actor:, invoice:, gateway:)
        agreement = checkout.agreement
        validate_invoice_identity!(checkout, invoice)
        cents = (agreement.amount * 100).to_i
        lines = invoice.dig("lines", "data")
        line = lines&.first
        raise StripeGateway::Invalid, "Stripe invoice terms need operator reconciliation." unless
          invoice["livemode"] == false && invoice.dig("parent", "subscription_details", "subscription") == checkout.subscription_id &&
          invoice["status"] == "paid" && invoice["amount_paid"] == cents &&
          invoice["total"] == cents && invoice["currency"] == "usd" && invoice["amount_remaining"] == 0 &&
          lines.is_a?(Array) && lines.one? && invoice.dig("lines", "has_more") == false && line.dig("parent", "subscription_item_details", "proration") == false &&
          line["amount"] == cents && line.dig("parent", "subscription_item_details", "subscription") == checkout.subscription_id &&
          %w[subscription_create subscription_cycle].include?(invoice["billing_reason"])
        payments = gateway.request(:get, "/v1/invoice_payments", account: checkout.account_id, fields: { "invoice" => invoice.fetch("id"), "status" => "paid", "limit" => "2" })
        raise StripeGateway::Invalid, "Invoice payment allocation needs reconciliation." unless payments["data"].is_a?(Array) && payments["data"].one? && payments["has_more"] == false && payments["data"].first["amount_paid"] == cents
        payment_id = payments["data"].first.dig("payment", "payment_intent")
        raise StripeGateway::Invalid, "Invoice has no verified card payment." unless payment_id.to_s.match?(/\Api_[a-zA-Z0-9]+\z/)
        payment = gateway.request(:get, "/v1/payment_intents/#{payment_id}", account: checkout.account_id)
        raise StripeGateway::Invalid, "Invoice payment or application fee does not match." unless
          payment["id"] == payment_id && payment["livemode"] == false && payment["status"] == "succeeded" &&
          payment["amount_received"] == cents && payment["currency"] == "usd" &&
          payment["application_fee_amount"] == checkout.application_fee_cents
        paid_at = Time.at(Integer(invoice.fetch("status_transitions").fetch("paid_at"))).utc
        period_start = Time.at(Integer(line.fetch("period").fetch("start"))).utc
        period_end = Time.at(Integer(line.fetch("period").fetch("end"))).utc
        raise StripeGateway::Invalid, "Invalid membership period." unless period_end > period_start && period_start <= Time.current
        ApplicationRecord.transaction do
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.invoice.lock!
          agreement.lock!
          checkout.lock!
          cycles = StripeMembershipCycle.where(practice: agreement.practice, checkout: checkout)
          next agreement if cycles.exists?(provider_invoice_id: invoice.fetch("id"))
          local_invoice = if invoice["billing_reason"] == "subscription_create"
            agreement.invoice
          else
            created = agreement.practice.invoices.create!(patient: agreement.patient, currency: agreement.currency, status: "draft", rounding_policy_version: Money::POLICY_VERSION)
            created.lines.create!(practice: agreement.practice, patient: agreement.patient, quantity: 1, unit_amount: agreement.amount,
              posted_amount: agreement.amount, description_snapshot: "Membership renewal: #{agreement.snapshot['package_name']}")
            created.transition_to!("posted")
            created
          end
          raise ArgumentError, "Reconcile existing invoice activity before applying Stripe." unless local_invoice.status == "posted" &&
            local_invoice.payment_allocations.empty? && local_invoice.credit_notes.empty?
          allocation = StripeMembershipPayments.record_verified_payment(checkout: checkout, invoice: local_invoice, payment_id: payment_id, paid_at: paid_at)
          previous_end = cycles.maximum(:period_end)
          cycles.create!(practice: agreement.practice, invoice: local_invoice, provider_invoice_id: invoice.fetch("id"),
            provider_payment_id: payment_id, period_start: period_start, period_end: period_end)
          if previous_end.nil? || period_end > previous_end
            agreement.events.create!(practice: agreement.practice, kind: "active", request_key: "stripe:invoice:#{invoice.fetch('id')}",
              details: { starts_at: period_start.iso8601, ends_at: period_end.iso8601, invoice_id: local_invoice.id,
                payment_event_id: allocation.payment_event_id, application_fee_cents: checkout.application_fee_cents, processor: "stripe" })
          end
          intent = checkout.collection_intent
          intent.transition_to!("succeeded") unless intent.reload.state == "succeeded"
          BillingReceipt.create!(practice: agreement.practice, patient: agreement.patient, invoice: local_invoice,
            payment_event: allocation.payment_event, issued_by: actor, kind: "subscription_payment", issued_at: paid_at,
            payload: { amount: agreement.amount.to_s("F"), currency: agreement.currency, subscription_id: agreement.id })
          AuditRecorder.record!(practice: agreement.practice, actor: actor, action_code: "stripe.renewal.paid", outcome: :committed,
            resource_version_ref: "invoice:#{local_invoice.id}")
          agreement
        end
        if payment["latest_charge"]
          charge = gateway.request(:get, "/v1/charges/#{payment.fetch('latest_charge')}", account: checkout.account_id)
          apply_refund(checkout: checkout, charge: charge, actor: actor)
        end
        agreement
      end

      def self.refund_webhook(payload, gateway: StripeGateway.new)
        connection = StripeConnection.find_by(account_id: payload.fetch("account"))
        return unless connection
        id = payload.dig("data", "object", "id")
        raise StripeGateway::Invalid, "Invalid Stripe charge identity." unless id.to_s.match?(/\Ach_[a-zA-Z0-9]+\z/)
        charge = gateway.request(:get, "/v1/charges/#{id}", account: connection.account_id)
        payment = PaymentEvent.find_by(practice: connection.practice,
          external_event_reference: "stripe:#{connection.account_id}:#{charge['payment_intent']}")
        raise StripeGateway::Unavailable, "Reconcile the original payment before this refund." unless payment
        cycle = StripeMembershipCycle.where(practice: connection.practice, provider_payment_id: charge["payment_intent"]).first
        checkout = cycle&.checkout || StripeCheckout.where(practice: connection.practice, agreement_id:
          Care::SubscriptionAgreement.where(practice: connection.practice, invoice_id: payment.allocations.select(:invoice_id)).select(:id)).first
        raise StripeGateway::Invalid, "Stripe refund has no membership routing." unless checkout
        apply_refund(checkout: checkout, charge: charge, actor: connection.connected_by)
      end

      # Dashboard refunds are read from the connected account; this does not
      # initiate a refund or pretend that an application fee was returned.
      def self.apply_refund(checkout:, charge:, actor:)
        raise StripeGateway::Invalid, "Stripe refund charge does not match." unless
          charge["livemode"] == false && charge["currency"] == checkout.agreement.currency.downcase &&
          charge["amount"] == (checkout.agreement.amount * 100).to_i && charge["paid"] == true &&
          charge["amount_refunded"].is_a?(Integer) && charge["amount_refunded"].between?(0, charge["amount"])
        return if charge["amount_refunded"].zero?
        ApplicationRecord.transaction do
          agreement = checkout.agreement
          agreement.practice.lock!
          agreement.patient.lock!
          agreement.lock!
          payment = PaymentEvent.where(practice: checkout.practice, patient: agreement.patient).lock.find_by!(
            external_event_reference: "stripe:#{checkout.account_id}:#{charge.fetch('payment_intent')}")
          total = BigDecimal(charge["amount_refunded"].to_s) / 100
          remaining = total - payment.refund_events.sum(:amount)
          next unless remaining.positive?
          refund_reason = "Confirmed Stripe refund"
          refund = payment.refund_events.create!(practice: checkout.practice, patient: agreement.patient,
            currency: payment.currency, amount: remaining, reason: refund_reason)
          invoice = payment.allocations.first!.invoice
          BillingReceipt.create!(practice: checkout.practice, patient: agreement.patient, invoice: invoice,
            payment_event: payment, issued_by: actor, kind: "subscription_refund", issued_at: Time.current,
            payload: { amount: remaining.to_s("F"), currency: payment.currency, refund_id: refund.id, reason: refund_reason })
          active = agreement.events.where(kind: "active").order(id: :desc).first
          if total == payment.amount && active&.details&.fetch("payment_event_id", nil) == payment.id
            agreement.events.create!(practice: checkout.practice, kind: "refunded", request_key: "stripe:refund:#{payment.id}",
              details: { amount: total.to_s("F"), refund_id: refund.id })
          end
          AuditRecorder.record!(practice: checkout.practice, actor: actor, action_code: "stripe.refund.observed", outcome: :committed,
            resource_version_ref: "refund:#{refund.id}")
        end
      end

      # Explicit recovery backfills missed paid invoices; no new charge is made.
      def self.recover_history(checkout:, actor:, gateway: StripeGateway.new)
        Care::SubscriptionAccess.authorize!(agreement: checkout.agreement, actor: actor)
        StripeMembershipPayments.reconcile(checkout: checkout, actor: actor, gateway: gateway)
        return checkout.agreement unless checkout.reload.subscription_id
        cursor = nil
        loop do
          fields = { "subscription" => checkout.subscription_id, "status" => "paid", "limit" => "100" }
          fields["starting_after"] = cursor if cursor
          page = gateway.request(:get, "/v1/invoices", account: checkout.account_id, fields: fields)
          raise StripeGateway::Invalid, "Stripe invoice history is unavailable." unless page["data"].is_a?(Array)
          page["data"].each { |invoice| sync(checkout: checkout, actor: actor, invoice_id: invoice.fetch("id"), gateway: gateway) }
          break unless page["has_more"]
          next_cursor = page["data"].last&.fetch("id")
          raise StripeGateway::Invalid, "Stripe invoice pagination did not advance." unless next_cursor && next_cursor != cursor
          cursor = next_cursor
        end
        checkout.agreement
      end

      def self.payment_url(checkout:, actor:, gateway: StripeGateway.new)
        Care::SubscriptionAccess.authorize!(agreement: checkout.agreement, actor: actor)
        subscription = fetch_subscription(checkout.subscription_id, checkout.account_id, gateway)
        validate_subscription!(checkout, subscription)
        id = subscription["latest_invoice"]
        raise StripeGateway::Unavailable, "No outstanding Stripe invoice. Check membership status." unless id.to_s.match?(/\Ain_[a-zA-Z0-9]+\z/)
        invoice = gateway.request(:get, "/v1/invoices/#{id}", account: checkout.account_id)
        validate_invoice_identity!(checkout, invoice)
        raise ArgumentError, "No payable renewal is outstanding. Check membership status." unless invoice["status"] == "open" && invoice["amount_remaining"].to_i.positive?
        StripeGateway.external_url(invoice.fetch("hosted_invoice_url"), host: "invoice.stripe.com")
      end

      def self.cancel(checkout:, actor:, gateway: StripeGateway.new)
        Care::SubscriptionAccess.authorize!(agreement: checkout.agreement, actor: actor)
        StripeMembershipPayments.reconcile(checkout: checkout, actor: actor, gateway: gateway)
        checkout.reload
        if !checkout.subscription_id && checkout.session_status == "open"
          session = gateway.request(:post, "/v1/checkout/sessions/#{checkout.session_id}/expire", account: checkout.account_id,
            key: "expire:#{checkout.collection_intent.reference}")
          StripeMembershipPayments.verify_session!(checkout, session)
          raise StripeGateway::Unavailable, "Reconcile checkout before canceling." unless session["status"] == "expired" && session["subscription"].nil?
          checkout.with_lock { checkout.update!(session_status: "expired") }
          StripeMembershipPayments.expire_unpaid(checkout, actor)
          return checkout.agreement
        end
        return checkout.agreement if !checkout.subscription_id && checkout.session_status == "expired"
        raise StripeGateway::Unavailable, "Reconcile the initial checkout before canceling renewal." unless checkout.subscription_id
        # Automatic plans require end-of-period cancellation; no unapproved proration.
        subscription = gateway.request(:post, "/v1/subscriptions/#{checkout.subscription_id}", account: checkout.account_id,
          key: "cancel:#{checkout.collection_intent.reference}", fields: { "cancel_at_period_end" => "true" })
        validate_subscription!(checkout, subscription)
        raise StripeGateway::Unavailable, "Stripe has not confirmed cancellation." unless subscription["cancel_at_period_end"] == true || subscription["status"] == "canceled"
        sync(checkout: checkout, actor: actor, gateway: gateway)
        AuditRecorder.record!(practice: checkout.practice, actor: actor, action_code: "stripe.renewal.canceled", outcome: :committed)
        checkout.agreement
      end
    end
  end
end
