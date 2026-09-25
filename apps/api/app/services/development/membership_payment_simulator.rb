module Development
  class MembershipPaymentSimulator
    SOURCE = "local_membership_payment_simulator"
    ENVIRONMENT_KEY = "APP_LOCAL_MEMBERSHIP_SIMULATOR_PRACTICE_IDS"
    OUTCOMES = %w[paid renewal_failed cancel_at_period_end].freeze
    Result = Struct.new(:prospect, :event_id, keyword_init: true)

    class Gateway
      attr_reader :practice_id

      def initialize(practice:, prospect:, outcome: "pending", channel: :checkout)
        @practice = practice
        @practice_id = practice.id
        @prospect = prospect
        @outcome = outcome
        @channel = channel.to_sym
      end

      def local_membership_simulator?
        true
      end

      def local_phone_payment_simulator?
        @channel == :phone
      end

      def phone_reader_id
        raise Clinic::Billing::StripeGateway::Invalid, "Telephone reader is only available for phone payments." unless
          local_phone_payment_simulator?

        id("tmr_local", "phone-reader")
      end

      def checkout_url
        "/memberships/account?payment=local"
      end

      def return_url(_prospect, _outcome)
        checkout_url
      end

      def checkout_session
        prospect = @prospect.reload
        paid = @outcome == "paid"
        terminal = %w[paid failed].include?(@outcome)
        recurring = prospect.selected_terms.fetch("renewal") == "automatic"
        {
          "id" => id("cs_test_local", "checkout"),
          "livemode" => false,
          "mode" => recurring ? "subscription" : "payment",
          "status" => terminal ? "complete" : "open",
          "payment_status" => paid ? "paid" : "unpaid",
          "subscription" => paid && recurring ? id("sub_local", "subscription") : nil,
          "payment_intent" => paid && !recurring ? id("pi_local", "initial-payment") : nil,
          "amount_total" => amount_cents,
          "currency" => currency,
          "metadata" => {
            "apply_membership_prospect" => prospect.checkout_reference,
            "apply_collection_intent" => prospect.checkout_reference
          },
          "url" => checkout_url
        }
      end

      def request(method, path, **options)
        return phone_request(method, path, options) if local_phone_payment_simulator?

        value = case [method, path]
        when [:get, "/v2/core/accounts/#{connection.account_id}"]
          account
        when [:post, "/v1/checkout/sessions"]
          checkout_session
        when [:get, "/v1/checkout/sessions/#{id('cs_test_local', 'checkout')}"]
          checkout_session
        when [:get, "/v1/subscriptions/#{id('sub_local', 'subscription')}"]
          subscription
        when [:get, "/v1/invoices/#{id('in_local', 'initial-invoice')}"]
          invoice(initial: true)
        when [:get, "/v1/invoices/#{id('in_local', 'renewal-invoice')}"]
          invoice(initial: false)
        when [:get, "/v1/invoice_payments"]
          invoice_payments(options.fetch(:fields).fetch("invoice"))
        when [:get, "/v1/payment_intents/#{id('pi_local', 'initial-payment')}"]
          payment_intent(initial: true)
        when [:get, "/v1/payment_intents/#{id('pi_local', 'renewal-payment')}"]
          payment_intent(initial: false)
        when [:get, "/v1/charges/#{id('ch_local', 'initial-charge')}"]
          charge(initial: true)
        when [:get, "/v1/charges/#{id('ch_local', 'renewal-charge')}"]
          charge(initial: false)
        else
          raise Clinic::Billing::StripeGateway::Invalid,
            "The local membership simulator received an unsupported payment request."
        end
        value.deep_dup
      end

      def subscription
        checkout = stripe_checkout
        failed_renewal = @outcome == "renewal_failed" ||
          (@outcome == "cancel_at_period_end" && checkout&.renewal_invoice_status == "open")
        {
          "id" => id("sub_local", "subscription"),
          "livemode" => false,
          "customer" => @prospect.staff_payment_customer_id,
          "default_payment_method" => @prospect.staff_payment_customer_id && id("pm_local", "phone-payment-method"),
          "metadata" => { "apply_membership_prospect" => @prospect.checkout_reference,
            "apply_collection_intent" => @prospect.checkout_reference },
          "application_fee_percent" => application_fee_cents.positive? ? "2.1" : nil,
          "items" => { "data" => [{
            "quantity" => 1,
            "price" => {
              "id" => @prospect.staff_payment_price_id,
              "unit_amount" => amount_cents,
              "currency" => currency,
              "recurring" => { "interval" => "month", "interval_count" => 1 }
            }
          }], "has_more" => false },
          "collection_method" => "charge_automatically",
          "trial_end" => nil,
          "pause_collection" => nil,
          "discounts" => [],
          "status" => failed_renewal ? "past_due" : "active",
          "latest_invoice" => failed_renewal ? id("in_local", "renewal-invoice") : id("in_local", "initial-invoice"),
          "cancel_at_period_end" => @outcome == "cancel_at_period_end"
        }
      end

      def invoice(initial:)
        paid = initial || @outcome == "paid"
        period_start = initial_paid_at
        period_start = period_start.advance(months: 1) unless initial
        {
          "id" => id("in_local", initial ? "initial-invoice" : "renewal-invoice"),
          "livemode" => false,
          "parent" => { "subscription_details" => {
            "subscription" => id("sub_local", "subscription")
          } },
          "currency" => currency,
          "status" => paid ? "paid" : "open",
          "amount_paid" => paid ? amount_cents : 0,
          "total" => amount_cents,
          "amount_remaining" => paid ? 0 : amount_cents,
          "billing_reason" => initial ? "subscription_create" : "subscription_cycle",
          "status_transitions" => { "paid_at" => paid ? period_start.to_i : nil },
          "lines" => { "data" => [{
            "amount" => amount_cents,
            "parent" => { "subscription_item_details" => {
              "proration" => false,
              "subscription" => id("sub_local", "subscription")
            } },
            "period" => { "start" => period_start.to_i, "end" => period_start.advance(months: 1).to_i }
          }], "has_more" => false }
        }
      end

      private

      def phone_request(method, path, options)
        value = case [method, path]
        when [:get, "/v2/core/accounts/#{connection.account_id}"]
          account
        when [:post, "/v1/checkout/sessions"]
          checkout_session
        when [:get, "/v1/checkout/sessions/#{id('cs_test_local', 'checkout')}"]
          checkout_session
        when [:post, "/v1/checkout/sessions/#{id('cs_test_local', 'checkout')}/expire"]
          checkout_session.merge("status" => "expired", "payment_status" => "unpaid")
        when [:post, "/v1/customers"]
          { "id" => id("cus_local", "phone-customer"), "livemode" => false }
        when [:post, "/v1/setup_intents"]
          phone_setup_intent(status: "requires_payment_method")
        when [:get, "/v1/setup_intents/#{id('seti_local', 'phone-setup')}"]
          phone_setup_intent(status: @outcome == "paid" ? "succeeded" : "requires_payment_method")
        when [:post, "/v1/terminal/readers/#{phone_reader_id}/process_setup_intent"]
          { "id" => phone_reader_id, "livemode" => false,
            "action" => { "type" => "process_setup_intent", "status" => "in_progress",
              "process_setup_intent" => { "setup_intent" => id("seti_local", "phone-setup") } } }
        when [:post, "/v1/products"]
          { "id" => id("prod_local", "phone-product"), "livemode" => false }
        when [:post, "/v1/prices"]
          { "id" => id("price_local", "phone-price"), "livemode" => false }
        when [:post, "/v1/subscriptions"]
          subscription
        when [:get, "/v1/subscriptions/#{id('sub_local', 'subscription')}"]
          subscription
        when [:get, "/v1/invoices/#{id('in_local', 'initial-invoice')}"]
          invoice(initial: true)
        when [:get, "/v1/invoice_payments"]
          invoice_payments(options.fetch(:fields).fetch("invoice"))
        when [:get, "/v1/payment_intents/#{id('pi_local', 'initial-payment')}"]
          payment_intent(initial: true)
        when [:get, "/v1/charges/#{id('ch_local', 'initial-charge')}"]
          charge(initial: true)
        else
          raise Clinic::Billing::StripeGateway::Invalid,
            "The local telephone-payment simulator received an unsupported payment request."
        end
        value.deep_dup
      end

      def phone_setup_intent(status:)
        {
          "id" => id("seti_local", "phone-setup"), "livemode" => false, "status" => status,
          "customer" => id("cus_local", "phone-customer"),
          "payment_method" => status == "succeeded" ? id("pm_local", "phone-payment-method") : nil,
          "metadata" => { "apply_membership_prospect" => @prospect.checkout_reference }
        }
      end

      def account
        {
          "id" => connection.account_id,
          "livemode" => false,
          "dashboard" => "full",
          "metadata" => { "apply_connection" => connection.reference },
          "defaults" => { "responsibilities" => {
            "fees_collector" => "stripe", "losses_collector" => "stripe"
          } },
          "configuration" => { "merchant" => { "capabilities" => {
            "card_payments" => { "status" => "active" },
            "stripe_balance" => { "payouts" => { "status" => "active" } }
          } } }
        }
      end

      def invoice_payments(invoice_id)
        initial = invoice_id == id("in_local", "initial-invoice")
        payment_id = id("pi_local", initial ? "initial-payment" : "renewal-payment")
        { "data" => [{ "amount_paid" => amount_cents,
          "payment" => { "payment_intent" => payment_id } }], "has_more" => false }
      end

      def payment_intent(initial:)
        payment_id = id("pi_local", initial ? "initial-payment" : "renewal-payment")
        charge_id = id("ch_local", initial ? "initial-charge" : "renewal-charge")
        {
          "id" => payment_id,
          "livemode" => false,
          "status" => "succeeded",
          "amount_received" => amount_cents,
          "amount" => amount_cents,
          "currency" => currency,
          "application_fee_amount" => application_fee_cents,
          "latest_charge" => charge_id,
          "metadata" => { "apply_collection_intent" => @prospect.checkout_reference }
        }
      end

      def charge(initial:)
        payment_id = id("pi_local", initial ? "initial-payment" : "renewal-payment")
        {
          "id" => id("ch_local", initial ? "initial-charge" : "renewal-charge"),
          "livemode" => false,
          "payment_intent" => payment_id,
          "status" => "succeeded",
          "paid" => true,
          "created" => initial_paid_at.to_i,
          "currency" => currency,
          "amount" => amount_cents,
          "amount_refunded" => 0
        }
      end

      def connection
        @connection ||= Clinic::Billing::StripeConnection.find_by(practice_id: @practice.id)
      end

      def stripe_checkout
        return unless @prospect.agreement_id

        Clinic::Billing::StripeCheckout.find_by(
          practice_id: @practice.id,
          agreement_id: @prospect.agreement_id
        )
      end

      def amount_cents
        (BigDecimal(@prospect.selected_terms.fetch("total").to_s) * 100).to_i
      end

      def application_fee_cents
        @prospect.application_fee_cents.to_i
      end

      def currency
        @prospect.selected_terms.fetch("currency").downcase
      end

      def initial_paid_at
        (@prospect.paid_at || @prospect.created_at || Time.current).utc.change(usec: 0)
      end

      def id(prefix, purpose)
        digest = OpenSSL::HMAC.hexdigest("SHA256", MembershipPaymentSimulator.signing_key,
          "#{@practice.id}:#{@prospect.id}:#{purpose}")
        "#{prefix}#{digest.first(24)}"
      end
    end

    class << self
      def enabled_for?(practice)
        return false unless GuidedDemoAccess.enabled?
        return true if DemoRun.local_practice?(practice)
        return true if Rails.env.development? && ENV["APP_DEVELOPMENT_LOGIN"] == "1"
        return false if GuidedDemoAccess.hosted?

        configured = ENV.fetch(ENVIRONMENT_KEY, "")
        if configured.blank? && Rails.env.development?
          path = Rails.root.join("tmp", "stripe-sandbox.json")
          if path.file?
            values = JSON.parse(path.read.sub(/\A\uFEFF/, ""))
            configured = values[ENVIRONMENT_KEY].to_s if values.is_a?(Hash)
          end
        end
        configured.split(",").map(&:strip).include?(practice.id.to_s)
      rescue JSON::ParserError, IOError, SystemCallError
        false
      end

      def phone_gateway_for!(practice:, prospect:, outcome: "pending")
        ensure_enabled!(practice)
        connection = Clinic::Billing::StripeConnection.find_by(practice_id: practice.id) || ensure_connection!(practice)
        raise Clinic::Billing::StripeGateway::Unavailable,
          "The local telephone-payment simulator needs a clinic payment connection." unless connection&.account_id

        Gateway.new(practice:, prospect:, outcome:, channel: :phone)
      end

      def gateway_for!(practice:, prospect:)
        ensure_enabled!(practice)
        ensure_connection!(practice)
        Gateway.new(practice:, prospect:)
      end

      def staff_gateway_for!(practice:, prospect:)
        ensure_enabled!(practice)
        connection = Clinic::Billing::StripeConnection.find_by(practice_id: practice.id) || ensure_connection!(practice)
        unless simulator_compatible_connection?(connection)
          raise Clinic::Billing::StripeGateway::Unavailable,
            "The local one-time payment simulator needs a configured clinic test-payment connection."
        end

        Gateway.new(practice:, prospect:)
      end

      def gateway?(gateway, practice:)
        enabled_for?(practice) && gateway.instance_of?(Gateway) && gateway.practice_id == practice.id
      end

      def connection?(record)
        return false unless record&.practice_id && record.account_id

        record.reference == "#{SOURCE}:practice:#{record.practice_id}" &&
          record.account_id == local_account_id(record.practice_id)
      end

      def state(prospect)
        checkout = if prospect.agreement_id
          Clinic::Billing::StripeCheckout.find_by(practice_id: prospect.practice_id,
            agreement_id: prospect.agreement_id)
        end
        {
          enabled: enabled_for?(prospect.practice),
          source: SOURCE,
          vendor_confirmed: false,
          evidence: "server_signed_local_event",
          checkout_started: prospect.checkout_session_id.present?,
          payment_verified: prospect.paid_at.present?,
          recurring: prospect.selected_terms.fetch("renewal") == "automatic",
          renewal_status: checkout&.subscription_status,
          renewal_invoice_status: checkout&.renewal_invoice_status,
          renewal_amount_due: checkout&.renewal_amount_due&.to_s("F"),
          cancel_at_period_end: checkout&.cancel_at_period_end == true
        }
      end

      def record!(practice:, prospect:, user:, outcome:, request_key:)
        ensure_enabled!(practice)
        validate_prospect!(practice:, prospect:, user:)
        outcome = outcome.to_s
        raise ArgumentError, "Choose a supported local payment outcome." unless OUTCOMES.include?(outcome)

        Clinic::Care::SubscriptionDefinition.request_key(request_key)
        connection = ensure_connection!(practice)
        if prospect.checkout_account_id != connection.account_id
          repair_local_checkout_binding!(practice:, prospect:, user:, connection:)
          prospect.reload
        end
        event = verify_event!(sign_event(event_claims(prospect:, outcome:, request_key:)))
        gateway = Gateway.new(practice:, prospect:, outcome: event.fetch("outcome"))
        dispatch!(prospect:, outcome:, gateway:)
        verify_outcome!(prospect.reload, outcome)
        actor = connection.connected_by
        Clinic::AuditRecorder.record!(practice:, actor:,
          action_code: "development.membership_payment_simulator.#{outcome}", outcome: :committed,
          resource_version_ref: "#{SOURCE}:#{event.fetch('event_id')}:membership_prospect:#{prospect.id}")
        Result.new(prospect: prospect.reload, event_id: event.fetch("event_id"))
      end

      def record_staff_one_time!(practice:, prospect:, actor:, request_key:)
        ensure_enabled!(practice)
        validate_staff_one_time!(practice:, prospect:, actor:)
        Clinic::Care::SubscriptionDefinition.request_key(request_key)
        gateway = staff_gateway_for!(practice:, prospect:)
        connection = Clinic::Billing::StripeConnection.find_by!(practice_id: practice.id)
        prospect.reload

        if prospect.status.in?(%w[paid_onboarding converted])
          validate_local_checkout_binding!(prospect, connection)
          verify_outcome!(prospect, "paid", compatible_connection: connection)
          return Result.new(prospect:, event_id: event_claims(prospect:, outcome: "paid", request_key:).fetch("event_id"))
        end

        if prospect.checkout_session_id.blank?
          Clinic::MembershipGrowth::PublicCheckout.start_for_prospect(
            practice:, prospect:, replayed: false, gateway:
          )
          prospect.reload
        else
          validate_local_checkout_binding!(prospect, connection)
        end

        event = verify_event!(sign_event(event_claims(prospect:, outcome: "paid", request_key:)))
        paid_gateway = Gateway.new(practice:, prospect:, outcome: event.fetch("outcome"))
        dispatch!(prospect:, outcome: "paid", gateway: paid_gateway)
        verify_outcome!(prospect.reload, "paid", compatible_connection: connection)
        Clinic::AuditRecorder.record!(practice:, actor:,
          action_code: "development.membership_payment_simulator.staff_one_time_paid", outcome: :committed,
          resource_version_ref: "#{SOURCE}:#{event.fetch('event_id')}:membership_prospect:#{prospect.id}")
        Result.new(prospect: prospect.reload, event_id: event.fetch("event_id"))
      end

      def signing_key
        Rails.application.key_generator.generate_key("apply/local-membership-payment-simulator/v1", 32)
      end

      private

      def ensure_enabled!(practice)
        return if enabled_for?(practice)

        raise ActiveRecord::RecordNotFound
      end

      def ensure_connection!(practice)
        existing = Clinic::Billing::StripeConnection.find_by(practice_id: practice.id)
        return existing if connection?(existing)
        if existing
          raise Clinic::Billing::StripeGateway::Unavailable,
            "This clinic already has a different Stripe connection. Remove the local simulator opt-in or use that connection."
        end

        actor = practice.memberships.active.includes(:user).map(&:user).find(&:active?)
        raise Clinic::Billing::StripeGateway::Unavailable,
          "The local simulator needs an active clinic owner before payment can continue." unless actor

        Clinic::Billing::StripeConnection.create!(practice:, connected_by: actor,
          reference: "#{SOURCE}:practice:#{practice.id}", account_id: local_account_id(practice.id),
          charges_enabled: true, payouts_enabled: true, last_synced_at: Time.current)
      rescue ActiveRecord::RecordNotUnique
        record = Clinic::Billing::StripeConnection.find_by(practice_id: practice.id)
        return record if connection?(record)

        raise Clinic::Billing::StripeGateway::Unavailable,
          "The clinic payment connection changed while local checkout was starting."
      end

      def validate_prospect!(practice:, prospect:, user:)
        unless prospect.practice_id == practice.id && prospect.account_user_id == user.id &&
            prospect.account_activated_at && user.active?
          raise ActiveRecord::RecordNotFound
        end
      end

      def validate_staff_one_time!(practice:, prospect:, actor:)
        membership = practice.memberships.active.find_by(user_id: actor.id)
        valid = membership && actor.active? && prospect.practice_id == practice.id &&
          prospect.source == "front_desk_enrollment" && prospect.intent_type == "purchase" &&
          prospect.selected_terms.fetch("renewal") == "none" &&
          !prospect.selected_terms.fetch("eligibility_review", false)
        raise ActiveRecord::RecordNotFound unless valid
      end

      def validate_local_checkout_binding!(prospect, connection)
        return if prospect.checkout_session_id.to_s.start_with?("cs_test_local") &&
          prospect.checkout_account_id == connection.account_id && simulator_compatible_connection?(connection)

        raise Clinic::Billing::StripeGateway::Unavailable,
          "This enrollment is not bound to this clinic's local payment simulator. Start a new authorized enrollment."
      end

      def simulator_compatible_connection?(connection)
        return false unless connection&.practice_id && connection.account_id.to_s.match?(/\Aacct_[a-zA-Z0-9]+\z/)
        return true if connection?(connection)
        return false unless Clinic::Billing::StripeGateway.configured?
        return true if Clinic::Billing::StripeGateway.platform_sandbox_account?(connection.account_id)

        connection.charges_enabled? && connection.last_synced_at.present?
      end

      def repair_local_checkout_binding!(practice:, prospect:, user:, connection:)
        prospect.with_lock do
          locally_started_unpaid = prospect.checkout_session_id.to_s.start_with?("cs_test_local") &&
            prospect.checkout_status == "open" && prospect.status_checkout_pending? &&
            prospect.paid_at.nil? && prospect.patient_id.nil? && prospect.agreement_id.nil?
          same_account_owner = prospect.practice_id == practice.id &&
            prospect.account_user_id == user.id && user.active?
          known_platform_fallback = Clinic::Billing::StripeGateway.platform_sandbox_account?(
            prospect.checkout_account_id
          )
          unless locally_started_unpaid && same_account_owner && known_platform_fallback && connection?(connection)
            raise Clinic::Billing::StripeGateway::Unavailable,
              "This checkout is not bound to this clinic's local payment simulator. Start a new authorized enrollment."
          end

          prospect.update!(checkout_account_id: connection.account_id, application_fee_cents: 0)
        end

        Clinic::MembershipGrowth::PublicCheckout.start_for_account(practice:, prospect:, user:,
          gateway: Gateway.new(practice:, prospect:))
      end

      def verify_outcome!(prospect, outcome, compatible_connection: nil)
        checkout = if prospect.agreement_id
          Clinic::Billing::StripeCheckout.find_by(practice_id: prospect.practice_id,
            agreement_id: prospect.agreement_id)
        end
        verified = case outcome
        when "paid"
          prospect.paid_at.present? && prospect.patient_id.present? && prospect.receipt_id.present? &&
            prospect.portal_identity_id.present? && checkout &&
            (connection?(checkout.connection) ||
              (compatible_connection && checkout.connection_id == compatible_connection.id &&
                simulator_compatible_connection?(compatible_connection)))
        when "renewal_failed"
          checkout && checkout.subscription_status == "past_due" &&
            checkout.renewal_invoice_status == "open" && checkout.renewal_amount_due.to_d.positive?
        when "cancel_at_period_end"
          checkout&.cancel_at_period_end == true
        end
        return if verified

        raise Clinic::Billing::StripeGateway::Unavailable,
          "The local payment event did not reach its verified owning records. Retry the same operation."
      end

      def local_account_id(practice_id)
        digest = OpenSSL::HMAC.hexdigest("SHA256", signing_key, "practice:#{practice_id}")
        "acct_local#{digest.first(20)}"
      end

      def event_claims(prospect:, outcome:, request_key:)
        event_id = OpenSSL::HMAC.hexdigest("SHA256", signing_key,
          "#{prospect.practice_id}:#{prospect.id}:#{outcome}:#{request_key}").first(32)
        {
          "source" => SOURCE,
          "event_id" => "evt_local#{event_id}",
          "practice_id" => prospect.practice_id,
          "prospect_id" => prospect.id,
          "checkout_reference" => prospect.checkout_reference,
          "account_id" => prospect.checkout_account_id,
          "outcome" => outcome,
          "request_key" => request_key.to_s
        }
      end

      def signer
        ActiveSupport::MessageVerifier.new(signing_key, digest: "SHA256", serializer: JSON)
      end

      def sign_event(claims)
        signer.generate(claims, purpose: SOURCE)
      end

      def verify_event!(token)
        signer.verify(token, purpose: SOURCE)
      rescue ActiveSupport::MessageVerifier::InvalidSignature
        raise Clinic::Billing::StripeGateway::Invalid, "The local payment event could not be verified."
      end

      def dispatch!(prospect:, outcome:, gateway:)
        case outcome
        when "paid"
          raise ArgumentError, "Start the local checkout before completing payment." unless prospect.checkout_session_id
          payload = { "type" => "checkout.session.completed", "livemode" => false,
            "account" => prospect.checkout_account_id, "data" => { "object" => gateway.checkout_session } }
          Clinic::MembershipGrowth::PublicCheckout.webhook(payload:, gateway:)
        when "renewal_failed"
          checkout = recurring_checkout!(prospect)
          invoice = gateway.invoice(initial: false)
          payload = { "type" => "invoice.payment_failed", "livemode" => false,
            "account" => checkout.account_id, "data" => { "object" => invoice } }
          Clinic::Billing::StripeRecurringPayments.webhook(payload, gateway:)
        when "cancel_at_period_end"
          checkout = recurring_checkout!(prospect)
          payload = { "type" => "customer.subscription.updated", "livemode" => false,
            "account" => checkout.account_id, "data" => { "object" => gateway.subscription } }
          Clinic::Billing::StripeRecurringPayments.webhook(payload, gateway:)
        end
      end

      def recurring_checkout!(prospect)
        raise ArgumentError, "This membership does not renew automatically." unless
          prospect.selected_terms.fetch("renewal") == "automatic"
        checkout = Clinic::Billing::StripeCheckout.find_by(practice_id: prospect.practice_id,
          agreement_id: prospect.agreement_id)
        raise ArgumentError, "Complete the initial payment before simulating renewal status." unless
          prospect.paid_at && checkout&.subscription_id
        checkout
      end
    end
  end
end
