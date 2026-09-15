module Clinic
  module MembershipGrowth
    class StaffPhonePayment
      AUTHORIZATION_VERSION = "membership-recurring-phone-v1"
      EVENT_TYPES = %w[invoice.paid invoice.payment_failed invoice.payment_action_required
        customer.subscription.updated customer.subscription.deleted].freeze
      Result = Struct.new(:prospect, :payment, keyword_init: true)

      class << self
        def start(practice:, actor:, prospect_id:, lock_version:, authorization_confirmed:,
          authorization_version:, gateway: Clinic::Billing::StripeGateway.new)
          reviewer = Clinic::Authorization.authorize!(practice:, actor:, action: "subscriptions.review")
          raise ArgumentError, "Confirm the caller's recurring-payment authorization before continuing." unless
            authorization_confirmed == true && authorization_version == AUTHORIZATION_VERSION

          prospect = locked_prospect!(practice:, reviewer:, prospect_id:, lock_version:, start: true)
          gateway = development_gateway(practice:, prospect:, gateway:, outcome: "pending")
          connection, account_id, collect_fee = routing!(practice, gateway)
          reader_id = gateway.respond_to?(:local_phone_payment_simulator?) && gateway.local_phone_payment_simulator? ?
            gateway.phone_reader_id : Clinic::Billing::StripeGateway.moto_reader_id!
          configure_attempt!(prospect, reviewer, account_id, reader_id, collect_fee)
          retire_consumer_checkout!(prospect, gateway)
          if prospect.staff_payment_setup_intent_id
            setup_intent = gateway.request(:get, "/v1/setup_intents/#{prospect.staff_payment_setup_intent_id}",
              account: prospect.checkout_account_id, fields: { "expand[0]" => "latest_attempt" })
            validate_setup_intent!(prospect, setup_intent)
            return begin_reader!(prospect, actor, gateway) if setup_intent["status"] == "requires_payment_method"
            return refresh(practice:, actor:, prospect_id:, gateway:)
          end

          customer = gateway.request(:post, "/v1/customers", account: account_id,
            key: "#{prospect.checkout_reference}:phone-customer", fields: {
              "metadata[apply_membership_prospect]" => prospect.checkout_reference
            })
          validate_id!(customer, "id", /\Acus_[a-zA-Z0-9]+\z/, "customer")
          prospect.with_lock { prospect.update!(staff_payment_customer_id: customer.fetch("id")) }

          setup_intent = gateway.request(:post, "/v1/setup_intents", account: account_id,
            key: "#{prospect.checkout_reference}:phone-setup", fields: {
              "customer" => customer.fetch("id"), "usage" => "off_session",
              "payment_method_types[0]" => "card",
              "metadata[apply_membership_prospect]" => prospect.checkout_reference
            })
          validate_setup_intent!(prospect, setup_intent)
          prospect.with_lock { prospect.update!(staff_payment_setup_intent_id: setup_intent.fetch("id")) }

          begin_reader!(prospect, actor, gateway)
        rescue ArgumentError
          if defined?(prospect) && prospect && !prospect.selected_terms.fetch("eligibility_review", false)
            prospect.with_lock do
              prospect.update!(staff_payment_status: "failed", status: "payment_failed",
                follow_up_state: "open", follow_up_due_at: Current.business_time)
            end
          end
          raise
        end

        def refresh(practice:, actor:, prospect_id:, gateway: Clinic::Billing::StripeGateway.new)
          reviewer = Clinic::Authorization.authorize!(practice:, actor:, action: "subscriptions.review")
          prospect = MembershipProspect.where(practice_id: practice.id).find(prospect_id)
          gateway = development_gateway(practice:, prospect:, gateway:, outcome: "paid")
          unless prospect.intent_type == "purchase" && prospect.follow_up_assigned_to_membership_id == reviewer.id &&
              prospect.staff_payment_setup_intent_id.present?
            raise TransitionProspect::InvalidTransition, "Start this customer's phone payment before checking it."
          end
          return result(prospect, "paid") if prospect.status_paid_onboarding? || prospect.status_converted?

          connection = Clinic::Billing::StripeConnect.connection(practice)
          raise ArgumentError, "The clinic must complete Stripe onboarding before accepting payment." unless connection
          if prospect.staff_payment_subscription_id
            subscription = gateway.request(:get, "/v1/subscriptions/#{prospect.staff_payment_subscription_id}",
              account: prospect.checkout_account_id)
            return reconcile_subscription!(prospect, connection, subscription, gateway)
          end

          setup_intent = gateway.request(:get, "/v1/setup_intents/#{prospect.staff_payment_setup_intent_id}",
            account: prospect.checkout_account_id, fields: { "expand[0]" => "latest_attempt" })
          validate_setup_intent!(prospect, setup_intent)
          return result(prospect, "awaiting_card") unless setup_intent["status"] == "succeeded"

          payment_method = setup_intent["payment_method"].to_s
          raise Clinic::Billing::StripeGateway::Invalid, "Stripe did not return a reusable card for this caller." unless
            payment_method.match?(/\Apm_[a-zA-Z0-9]+\z/)
          create_subscription!(prospect, connection, payment_method, gateway)
        end

        def webhook(payload:, gateway: Clinic::Billing::StripeGateway.new)
          return unless payload.is_a?(Hash) && payload["livemode"] == false && EVENT_TYPES.include?(payload["type"])

          object = payload.dig("data", "object")
          return unless object.is_a?(Hash)
          subscription_id = payload["type"].start_with?("invoice.") ?
            (object.dig("parent", "subscription_details", "subscription") || object["subscription"]) : object["id"]
          return unless subscription_id.to_s.match?(/\Asub_[a-zA-Z0-9]+\z/)
          account_id = payload["account"].presence || Clinic::Billing::StripeGateway.configuration["STRIPE_SANDBOX_ACCOUNT_ID"]
          return unless account_id.to_s.match?(/\Aacct_[a-zA-Z0-9]+\z/)
          subscription = gateway.request(:get, "/v1/subscriptions/#{subscription_id}", account: account_id)
          reference = subscription.dig("metadata", "apply_membership_prospect")
          prospect = MembershipProspect.find_by(checkout_reference: reference, checkout_account_id: account_id,
            intent_type: "purchase", staff_payment_subscription_id: subscription_id)
          return unless prospect
          connection = Clinic::Billing::StripeConnect.connection(prospect.practice)
          return unless connection

          reconcile_subscription!(prospect, connection, subscription, gateway)
        end

        private

        def development_gateway(practice:, prospect:, gateway:, outcome:)
          return gateway unless gateway.instance_of?(Clinic::Billing::StripeGateway)
          return gateway unless defined?(Development::MembershipPaymentSimulator) &&
            Development::MembershipPaymentSimulator.enabled_for?(practice)

          Development::MembershipPaymentSimulator.phone_gateway_for!(practice:, prospect:, outcome:)
        end

        def locked_prospect!(practice:, reviewer:, prospect_id:, lock_version:, start:)
          version_text = lock_version.to_s
          raise ArgumentError, "Lock version must be a non-negative integer." unless version_text.match?(/\A\d+\z/)
          MembershipProspect.transaction do
            prospect = MembershipProspect.where(practice_id: practice.id).lock.find(prospect_id)
            raise ActiveRecord::StaleObjectError.new(prospect, "update") unless prospect.lock_version == version_text.to_i
            if prospect.selected_terms.fetch("eligibility_review", false)
              raise ArgumentError, "This membership requires clinic review before payment."
            end
            valid = prospect.intent_type == "purchase" && prospect.follow_up_state == "in_progress" &&
              prospect.follow_up_assigned_to_membership_id == reviewer.id &&
              prospect.status.in?(%w[new checkout_pending checkout_expired payment_failed]) &&
              (prospect.account_user_id.nil? || (prospect.account_activated_at && prospect.account_user.active?))
            raise TransitionProspect::InvalidTransition, "Start the signup call before taking payment by phone." if start && !valid
            prospect
          end
        end

        def routing!(practice, gateway)
          connection = Clinic::Billing::StripeConnect.connection(practice)
          raise ArgumentError, "The clinic must complete Stripe onboarding before accepting payment." unless connection&.account_id
          platform_id = Clinic::Billing::StripeGateway.configuration["STRIPE_SANDBOX_ACCOUNT_ID"]
          platform = Clinic::Billing::StripeGateway.platform_sandbox_account?(platform_id)
          account_id = platform ? platform_id : connection.account_id
          unless platform
            account = Clinic::Billing::StripeConnect.verified_account(connection, gateway)
            raise ArgumentError, "Stripe has not enabled this clinic's card payments." unless
              account.dig("configuration", "merchant", "capabilities", "card_payments", "status") == "active"
          end
          [ connection, account_id, !platform ]
        end

        def configure_attempt!(prospect, reviewer, account_id, reader_id, collect_fee)
          terms = prospect.selected_terms
          unless terms["renewal"] == "automatic" && terms["duration_unit"] == "months" && terms["duration"] == 1
            raise ArgumentError, "Phone enrollment currently supports automatically renewing monthly memberships."
          end
          prospect.with_lock do
            prospect.update!(checkout_reference: prospect.checkout_reference || "ci_#{SecureRandom.hex(16)}",
              checkout_account_id: account_id, checkout_mode: "subscription",
              application_fee_cents: collect_fee ? Clinic::Billing::StripeMembershipPayments.fee_cents(terms.fetch("total")) : 0,
              staff_payment_reader_id: reader_id, recurring_authorized_at: Current.business_time,
              recurring_authorized_by_membership: reviewer,
              recurring_authorization_version: AUTHORIZATION_VERSION)
          end
        end

        def create_subscription!(prospect, connection, payment_method, gateway)
          account_id = prospect.checkout_account_id
          product = gateway.request(:post, "/v1/products", account: account_id,
            key: "#{prospect.checkout_reference}:phone-product", fields: {
              "name" => "Clinic membership", "metadata[apply_membership_prospect]" => prospect.checkout_reference
            })
          validate_id!(product, "id", /\Aprod_[a-zA-Z0-9]+\z/, "product")
          prospect.with_lock { prospect.update!(staff_payment_product_id: product.fetch("id")) }
          price = gateway.request(:post, "/v1/prices", account: account_id,
            key: "#{prospect.checkout_reference}:phone-price", fields: {
              "product" => product.fetch("id"), "currency" => prospect.selected_terms.fetch("currency").downcase,
              "unit_amount" => amount_cents(prospect).to_s, "recurring[interval]" => "month",
              "recurring[interval_count]" => "1"
            })
          validate_id!(price, "id", /\Aprice_[a-zA-Z0-9]+\z/, "price")
          prospect.with_lock { prospect.update!(staff_payment_price_id: price.fetch("id")) }
          fields = {
            "customer" => prospect.staff_payment_customer_id, "items[0][price]" => price.fetch("id"),
            "default_payment_method" => payment_method, "collection_method" => "charge_automatically",
            "payment_behavior" => "default_incomplete", "payment_settings[save_default_payment_method]" => "on_subscription",
            "metadata[apply_membership_prospect]" => prospect.checkout_reference,
            "metadata[apply_collection_intent]" => prospect.checkout_reference,
            "expand[0]" => "latest_invoice"
          }
          fields["application_fee_percent"] = "2.1" if prospect.application_fee_cents.positive?
          subscription = gateway.request(:post, "/v1/subscriptions", account: account_id,
            key: "#{prospect.checkout_reference}:phone-subscription", fields:)
          validate_subscription!(prospect, subscription)
          prospect.with_lock do
            prospect.update!(staff_payment_subscription_id: subscription.fetch("id"),
              staff_payment_status: "payment_processing", status: "payment_processing",
              follow_up_due_at: Current.business_time + 1.day)
          end
          reconcile_subscription!(prospect.reload, connection, subscription, gateway)
        end

        def begin_reader!(prospect, actor, gateway)
          reader = gateway.request(:post,
            "/v1/terminal/readers/#{prospect.staff_payment_reader_id}/process_setup_intent",
            account: prospect.checkout_account_id, key: "#{prospect.checkout_reference}:phone-reader", fields: {
              "setup_intent" => prospect.staff_payment_setup_intent_id, "process_config[moto]" => "true",
              "allow_redisplay" => "limited"
            })
          validate_reader!(prospect, reader)
          prospect.with_lock do
            prospect.update!(status: "payment_processing", staff_payment_status: "awaiting_card",
              follow_up_state: "waiting", follow_up_outcome: "phone_payment_started",
              follow_up_due_at: Current.business_time + 15.minutes)
            Clinic::AuditRecorder.record!(practice: prospect.practice, actor:,
              action_code: "membership_prospects.phone_payment_started", outcome: :committed,
              resource_version_ref: "membership_prospect:#{prospect.id}")
          end
          result(prospect.reload, "awaiting_card")
        end

        def retire_consumer_checkout!(prospect, gateway)
          return unless prospect.checkout_session_id

          session = gateway.request(:get, "/v1/checkout/sessions/#{prospect.checkout_session_id}",
            account: prospect.checkout_account_id)
          raise Clinic::Billing::StripeGateway::Invalid, "The existing checkout does not match this caller." unless
            session["id"] == prospect.checkout_session_id && session["livemode"] == false &&
            session.dig("metadata", "apply_membership_prospect") == prospect.checkout_reference
          raise Clinic::Billing::StripeGateway::Unavailable,
            "This customer's online payment may already be complete. Reconcile it before taking another payment." if
            session["payment_status"] == "paid" || session["status"] == "complete"
          return if session["status"] == "expired"
          raise Clinic::Billing::StripeGateway::Invalid, "The existing online checkout cannot be safely closed." unless
            session["status"] == "open"

          expired = gateway.request(:post, "/v1/checkout/sessions/#{prospect.checkout_session_id}/expire",
            account: prospect.checkout_account_id, key: "#{prospect.checkout_reference}:phone-takeover")
          raise Clinic::Billing::StripeGateway::Invalid, "Stripe did not close the existing online checkout." unless
            expired["id"] == prospect.checkout_session_id && expired["status"] == "expired" &&
            expired["payment_status"] != "paid"
          prospect.with_lock { prospect.update!(checkout_status: "expired") }
        end

        def reconcile_subscription!(prospect, connection, subscription, gateway)
          validate_subscription!(prospect, subscription)
          invoice_id = subscription["latest_invoice"].is_a?(Hash) ? subscription.dig("latest_invoice", "id") : subscription["latest_invoice"]
          return result(prospect, "payment_processing") unless invoice_id.to_s.match?(/\Ain_[a-zA-Z0-9]+\z/)
          invoice = subscription["latest_invoice"].is_a?(Hash) ? subscription["latest_invoice"] :
            gateway.request(:get, "/v1/invoices/#{invoice_id}", account: prospect.checkout_account_id)
          return fail_payment!(prospect) if %w[void uncollectible].include?(invoice["status"])
          return result(prospect, "payment_processing") unless invoice["status"] == "paid"

          ApplicationRecord.transaction do
            PublicCheckout.fulfill_staff_subscription!(prospect:, connection:, subscription:, gateway:)
            prospect.reload.update!(staff_payment_status: "paid")
          end
          result(prospect.reload, "paid")
        end

        def validate_setup_intent!(prospect, setup_intent)
          validate_id!(setup_intent, "id", /\Aseti_[a-zA-Z0-9]+\z/, "setup intent")
          expected_id = prospect.staff_payment_setup_intent_id
          raise Clinic::Billing::StripeGateway::Invalid, "Stripe setup does not match this caller." unless
            setup_intent["livemode"] == false && (!expected_id || setup_intent["id"] == expected_id) &&
            setup_intent["customer"] == prospect.staff_payment_customer_id &&
            setup_intent.dig("metadata", "apply_membership_prospect") == prospect.checkout_reference
        end

        def validate_reader!(prospect, reader)
          raise Clinic::Billing::StripeGateway::Invalid, "Stripe reader does not match this phone payment." unless
            reader["id"] == prospect.staff_payment_reader_id && reader["livemode"] == false &&
            reader.dig("action", "type") == "process_setup_intent" &&
            reader.dig("action", "process_setup_intent", "setup_intent") == prospect.staff_payment_setup_intent_id
        end

        def validate_subscription!(prospect, subscription)
          price = subscription.dig("items", "data", 0, "price")
          fee = subscription["application_fee_percent"].to_s
          valid_fee = prospect.application_fee_cents.positive? ? fee.in?(["2.1", "2.10"]) : fee.blank?
          raise Clinic::Billing::StripeGateway::Invalid, "Stripe subscription does not match this phone enrollment." unless
            subscription["id"].to_s.match?(/\Asub_[a-zA-Z0-9]+\z/) && subscription["livemode"] == false &&
            subscription["customer"] == prospect.staff_payment_customer_id && valid_fee &&
            subscription.dig("metadata", "apply_membership_prospect") == prospect.checkout_reference &&
            subscription.dig("metadata", "apply_collection_intent") == prospect.checkout_reference &&
            subscription["collection_method"] == "charge_automatically" && subscription["trial_end"].nil? &&
            subscription.dig("items", "data").is_a?(Array) && subscription.dig("items", "data").one? &&
            price.is_a?(Hash) && price["id"] == prospect.staff_payment_price_id &&
            price["unit_amount"] == amount_cents(prospect) && price["currency"] == prospect.selected_terms.fetch("currency").downcase &&
            price.dig("recurring", "interval") == "month" && price.dig("recurring", "interval_count") == 1
        end

        def validate_id!(object, field, pattern, name)
          raise Clinic::Billing::StripeGateway::Invalid, "Stripe returned an invalid #{name}." unless
            object.is_a?(Hash) && object[field].to_s.match?(pattern) && object["livemode"] == false
        end

        def fail_payment!(prospect)
          prospect.with_lock do
            prospect.update!(staff_payment_status: "failed", status: "payment_failed",
              follow_up_state: "open", follow_up_due_at: Current.business_time)
          end
          result(prospect.reload, "failed")
        end

        def result(prospect, status)
          instructions = if status == "awaiting_card"
            if prospect.staff_payment_reader_id.to_s.start_with?("tmr_local")
              "Payment reader is ready. Enter the patient's card details on the reader, then check payment status."
            else
              "Enter the caller's card details on the assigned Stripe reader, then check payment status."
            end
          end
          Result.new(prospect: prospect.reload, payment: {
            status:, instructions:,
            simulation_available: prospect.staff_payment_reader_id.to_s.start_with?("tmr_local")
          })
        end

        def amount_cents(prospect)
          (BigDecimal(prospect.selected_terms.fetch("total").to_s) * 100).to_i
        end
      end
    end
  end
end
