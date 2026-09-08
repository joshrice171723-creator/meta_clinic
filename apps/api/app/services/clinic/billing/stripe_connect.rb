module Clinic
  module Billing
    class StripeConnect
      def self.connection(practice)
        StripeConnection.find_by(practice: practice)
      end

      def self.status(practice)
        record = connection(practice)
        { configured: StripeGateway.configured?, connected: record&.account_id.present?,
          charges_enabled: record&.charges_enabled || false, payouts_enabled: record&.payouts_enabled || false,
          application_fee_percent: "2.1", mode: "test", last_synced_at: record&.last_synced_at&.iso8601 }
      end

      def self.patient_checkout_available?(practice)
        record = connection(practice)
        StripeGateway.configured? && record&.account_id.present? &&
          record.charges_enabled
      end

      def self.authorize!(practice, actor)
        Authorization.authorize!(practice: practice, actor: actor, action: "subscription_catalog.publish")
        Authorization.authorize_with_legacy!(practice: practice, actor: actor, action: "billing.payment_record", legacy_action: "billing.write")
      end

      def self.onboard(practice:, actor:, gateway: StripeGateway.new)
        authorize!(practice, actor)
        raise StripeGateway::Unavailable, "Configure the platform's Stripe sandbox first." unless StripeGateway.configured?
        return_url = StripeGateway.return_url("/clinic/billing?stripe_setup=return")
        record = practice.with_lock do
          connection(practice) || StripeConnection.create!(practice: practice, connected_by: actor, reference: SecureRandom.uuid)
        end
        record.with_lock do
          unless record.account_id
            # Never reuse a pruned provider idempotency key after an unknown result.
            raise StripeGateway::Unavailable, "Account setup needs operator reconciliation before another attempt." if record.created_at < 23.hours.ago
            account = gateway.request(:post, "/v2/core/accounts", key: "connect:#{record.reference}", fields: {
              "identity" => { "country" => "us" }, "dashboard" => "full",
              "configuration" => { "merchant" => { "capabilities" => { "card_payments" => { "requested" => true } } } },
              "defaults" => { "currency" => "usd", "responsibilities" => { "fees_collector" => "stripe", "losses_collector" => "stripe" } },
              "metadata" => { "apply_connection" => record.reference }
            })
            raise StripeGateway::Invalid, "Stripe returned an invalid connected account." unless account["id"].to_s.match?(/\Aacct_[a-zA-Z0-9]+\z/)
            record.update!(account_id: account.fetch("id"))
          end
          AuditRecorder.record!(practice: practice, actor: actor, action_code: "stripe.onboarding.started", outcome: :committed)
        end
        link = gateway.request(:post, "/v2/core/account_links", fields: {
          "account" => record.account_id, "use_case" => { "type" => "account_onboarding", "account_onboarding" => {
            "configurations" => ["merchant"], "return_url" => return_url,
            "refresh_url" => StripeGateway.return_url("/clinic/billing?stripe_setup=refresh") } }
        })
        StripeGateway.external_url(link.fetch("url"), host: "connect.stripe.com")
      end

      def self.refresh(practice:, actor:, gateway: StripeGateway.new)
        authorize!(practice, actor)
        record = connection(practice)
        raise ArgumentError, "Start clinic onboarding first." unless record&.account_id
        account = verified_account(record, gateway)
        record.with_lock do
          record.update!(charges_enabled: account.dig("configuration", "merchant", "capabilities", "card_payments", "status") == "active",
            payouts_enabled: account.dig("configuration", "merchant", "capabilities", "stripe_balance", "payouts", "status") == "active", connected_by: actor, last_synced_at: Time.current)
          AuditRecorder.record!(practice: practice, actor: actor, action_code: "stripe.connection.checked", outcome: :committed)
        end
        status(practice)
      end

      def self.verified_account(record, gateway)
        account = gateway.request(:get, "/v2/core/accounts/#{record.account_id}", fields: { "include" => ["defaults", "configuration.merchant"] })
        raise StripeGateway::Invalid, "Stripe account configuration does not match this clinic." unless
          account["id"] == record.account_id && account.dig("metadata", "apply_connection") == record.reference &&
          account["livemode"] == false && account.dig("defaults", "responsibilities", "fees_collector") == "stripe" &&
          account.dig("defaults", "responsibilities", "losses_collector") == "stripe" && account["dashboard"] == "full"
        account
      end
    end
  end
end
