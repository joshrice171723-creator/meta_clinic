module Clinic
  module Telehealth
    module Config
      module_function

      def globally_enabled?
        ENV["APP_TELEHEALTH_ENABLED"] == "true"
      end

      def provider
        ENV.fetch("APP_TELEHEALTH_PROVIDER", "daily")
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

      def configured_for?(setting)
        globally_enabled? && provider == "daily" && setting&.provider_code == "daily" && setting.provider_account_ref.present? &&
          ActiveSupport::SecurityUtils.secure_compare(setting.provider_account_ref, daily_account_ref.to_s) && daily_api_key.present?
      end
    end
  end
end
