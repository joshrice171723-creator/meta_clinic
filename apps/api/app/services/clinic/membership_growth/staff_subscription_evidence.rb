module Clinic
  module MembershipGrowth
    # Read only the provider objects needed by staff conversion before taking
    # local conversion locks. The existing recurring verifier consumes copies;
    # an unexpected request fails closed instead of reaching the provider.
    class StaffSubscriptionEvidence
      attr_reader :subscription

      def initialize(prospect:, subscription:, gateway:)
        @started_at = Time.current
        @binding = binding(prospect)
        @reads = {}
        unless subscription["id"] == prospect.staff_payment_subscription_id
          raise Clinic::Billing::StripeGateway::Invalid, "Stripe subscription does not match this phone enrollment."
        end
        account = prospect.checkout_account_id
        @subscription = read(gateway, "/v1/subscriptions/#{subscription.fetch('id')}", account: account)
        invoice_id = @subscription["latest_invoice"]
        return unless invoice_id

        raise Clinic::Billing::StripeGateway::Invalid, "Invalid Stripe invoice identity." unless
          invoice_id.to_s.match?(/\Ain_[a-zA-Z0-9]+\z/)
        invoice = read(gateway, "/v1/invoices/#{invoice_id}", account: account)
        return unless invoice["status"] == "paid"

        payments = read(gateway, "/v1/invoice_payments", account: account,
          fields: { "invoice" => invoice.fetch("id"), "status" => "paid", "limit" => "2" })
        rows = payments["data"]
        cents = (BigDecimal(prospect.selected_terms.fetch("total").to_s) * 100).to_i
        raise Clinic::Billing::StripeGateway::Invalid, "Invoice payment allocation needs reconciliation." unless
          rows.is_a?(Array) && rows.one? && rows.first.is_a?(Hash) && payments["has_more"] == false && rows.first["amount_paid"] == cents
        payment_id = rows.first["payment"].is_a?(Hash) && rows.first.dig("payment", "payment_intent")
        raise Clinic::Billing::StripeGateway::Invalid, "Invoice has no verified card payment." unless
          payment_id.to_s.match?(/\Api_[a-zA-Z0-9]+\z/)
        payment = read(gateway, "/v1/payment_intents/#{payment_id}", account: account)
        if payment["latest_charge"]
          read(gateway, "/v1/charges/#{payment.fetch('latest_charge')}", account: account)
        end
      end

      def verify_current!(prospect:, checkout:)
        raise Clinic::Billing::StripeGateway::Unavailable, "Phone payment changed. Refresh its status before retrying." unless
          binding(prospect) == @binding && checkout.account_id == prospect.checkout_account_id &&
          checkout.subscription_id == subscription["id"]
        if checkout.last_synced_at && checkout.last_synced_at > @started_at
          raise Clinic::Billing::StripeGateway::Unavailable, "Newer payment evidence was recorded. Refresh before retrying."
        end
      end

      def request(method, path, **options)
        key = [ method, path, options ]
        unless method == :get && @reads.key?(key)
          raise Clinic::Billing::StripeGateway::Unavailable, "Payment evidence is incomplete. Refresh before retrying."
        end
        @reads.fetch(key).deep_dup
      end

      private

      def read(gateway, path, **options)
        response = gateway.request(:get, path, **options)
        raise Clinic::Billing::StripeGateway::Invalid, "Invalid Stripe payment evidence." unless response.is_a?(Hash)

        key = [ :get, path, options.deep_dup ]
        @reads[key] = response.deep_dup
        @reads.fetch(key).deep_dup
      end

      def binding(prospect)
        { practice_id: prospect.practice_id, account: prospect.checkout_account_id,
          reference: prospect.checkout_reference, subscription_id: prospect.staff_payment_subscription_id,
          customer_id: prospect.staff_payment_customer_id, price_id: prospect.staff_payment_price_id,
          setup_intent_id: prospect.staff_payment_setup_intent_id,
          assigned_member_id: prospect.follow_up_assigned_to_membership_id,
          authorized_at: prospect.recurring_authorized_at,
          authorized_member_id: prospect.recurring_authorized_by_membership_id,
          authorization_version: prospect.recurring_authorization_version,
          fee: prospect.application_fee_cents, terms: prospect.selected_terms.deep_dup }
      end
    end
  end
end
