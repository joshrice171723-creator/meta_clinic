require "stripe"
require "json"
require "uri"

module Clinic
  module Billing
    # Narrow server-only sandbox transport. No provider body/credential is logged.
    class StripeGateway
      class Unavailable < StandardError; end
      class Invalid < StandardError; end
      API_VERSION = "2026-08-26.dahlia"

      def self.configuration
        return {} unless Rails.env.development? || Rails.env.test?
        path = Rails.root.join("tmp", "stripe-sandbox.json")
        private_values = Rails.env.development? && path.file? ? JSON.parse(path.read.sub(/\A\uFEFF/, "")) : {}
        private_values = {} unless private_values.is_a?(Hash)
        %w[STRIPE_SANDBOX_KEY STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_RETURN_ORIGIN].to_h do |name|
          [name, ENV[name].presence || private_values[name]]
        end
      rescue JSON::ParserError, IOError, SystemCallError
        {}
      end

      def self.configured?
        (Rails.env.development? || Rails.env.test?) &&
          configuration["STRIPE_SANDBOX_KEY"].to_s.match?(/\A(?:sk|rk)_test_[a-zA-Z0-9]+\z/) &&
          configuration["STRIPE_CONNECT_WEBHOOK_SECRET"].to_s.start_with?("whsec_") &&
          configuration["STRIPE_RETURN_ORIGIN"].present?
      end

      def self.return_url(path)
        uri = URI.parse(configuration.fetch("STRIPE_RETURN_ORIGIN", "").to_s)
        local = uri.scheme == "http" && %w[127.0.0.1 localhost].include?(uri.host)
        raise Invalid, "Configure a trusted Stripe return origin." unless
          (uri.scheme == "https" || local) && uri.host.present? && uri.userinfo.nil? &&
          uri.query.nil? && uri.fragment.nil? && ["", "/"].include?(uri.path)
        "#{uri.to_s.delete_suffix('/')}#{path}"
      rescue URI::InvalidURIError
        raise Invalid, "Configure a trusted Stripe return origin."
      end

      def self.external_url(value, host:)
        uri = URI.parse(value.to_s)
        raise Invalid, "Stripe returned an invalid redirect." unless uri.scheme == "https" && uri.host == host && uri.userinfo.nil? && uri.port == 443
        uri.to_s
      rescue URI::InvalidURIError
        raise Invalid, "Stripe returned an invalid redirect."
      end

      def request(method, path, fields: {}, account: nil, key: nil)
        raise Unavailable, "Stripe sandbox is not configured on the server." unless self.class.configured?
        raise Invalid, "Invalid Stripe API path." unless path.match?(%r{\A/v[12]/[a-zA-Z0-9_/]+\z})
        raise Invalid, "Invalid Stripe account." if account && !account.match?(/\Aacct_[a-zA-Z0-9]+\z/)
        client = Stripe::StripeClient.new(self.class.configuration.fetch("STRIPE_SANDBOX_KEY"), stripe_version: API_VERSION)
        options = { idempotency_key: key, stripe_account: account }.compact
        payload = client.raw_request(method, path, params: fields, opts: options).data
        raise Invalid, "Stripe response could not be validated." unless payload.is_a?(Hash)
        payload.deep_stringify_keys
      rescue Stripe::StripeError
        raise Unavailable, "Stripe could not confirm this request. Retry the same operation; do not create another payment."
      end
    end
  end
end
