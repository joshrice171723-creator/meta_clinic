require "uri"

module Clinic
  module Telehealth
    module Config
      module_function

      def globally_enabled?
        ENV["APP_TELEHEALTH_ENABLED"] == "true"
      end

      def provider
        ENV.fetch("APP_TELEHEALTH_PROVIDER", "twilio")
      end

      def daily_api_key
        ENV["APP_TELEHEALTH_DAILY_API_KEY"].presence
      end

      def daily_webhook_secret
        ENV["APP_TELEHEALTH_DAILY_WEBHOOK_SECRET"].presence
      end

      def daily_account_ref
        ENV["APP_TELEHEALTH_DAILY_ACCOUNT_REF"].presence
      end

      def twilio_account_sid
        ENV["APP_TELEHEALTH_TWILIO_ACCOUNT_SID"].presence
      end

      def twilio_api_key_sid
        ENV["APP_TELEHEALTH_TWILIO_API_KEY_SID"].presence
      end

      def twilio_api_key_secret
        ENV["APP_TELEHEALTH_TWILIO_API_KEY_SECRET"].presence
      end

      def twilio_auth_token
        ENV["APP_TELEHEALTH_TWILIO_AUTH_TOKEN"].presence
      end

      def twilio_status_callback_url
        value = ENV["APP_TELEHEALTH_TWILIO_STATUS_CALLBACK_URL"].presence
        return unless value

        uri = URI.parse(value)
        uri if uri.is_a?(URI::HTTPS) && uri.host.present? && uri.userinfo.nil? && uri.fragment.nil?
      rescue URI::InvalidURIError
        nil
      end

      def account_ref(provider_code)
        case provider_code.to_s
        when "daily" then daily_account_ref
        when "twilio" then twilio_account_sid
        end
      end

      def configured_for?(setting)
        return false unless globally_enabled? && setting&.provider_account_ref.present?
        expected_ref = account_ref(setting.provider_code)
        return false unless expected_ref.present? && ActiveSupport::SecurityUtils.secure_compare(
          setting.provider_account_ref, expected_ref.to_s
        )

        case setting.provider_code
        when "daily"
          daily_api_key.present?
        when "twilio"
          twilio_api_key_sid.present? && twilio_api_key_secret.present? && twilio_auth_token.present? &&
            twilio_status_callback_url.present?
        else
          false
        end
      end
    end
  end
end
