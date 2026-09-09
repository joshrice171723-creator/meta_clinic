require "uri"

module Clinic
  module PatientPortal
    module RecoverySmsConfig
      TEST_FROM_NUMBER = "+15005550006"

      module_function

      def configured?
        ENV["APP_PATIENT_PORTAL_RECOVERY_SMS_ENABLED"] == "true" &&
          account_sid&.match?(/\AAC\h{32}\z/) &&
          authentication_username.present? && authentication_secret.present? &&
          sender_parameters.present? && origin.present?
      end

      def account_sid
        ENV["APP_PATIENT_PORTAL_TWILIO_ACCOUNT_SID"].presence || test_account_sid
      end

      def authentication_username
        ENV["APP_PATIENT_PORTAL_TWILIO_API_KEY_SID"].presence || (test_credentials? ? account_sid : nil)
      end

      def authentication_secret
        ENV["APP_PATIENT_PORTAL_TWILIO_API_KEY_SECRET"].presence || (test_credentials? ? ENV["TWILIO_TEST_AUTH_TOKEN"].presence : nil)
      end

      def sender_parameters
        return { "From" => TEST_FROM_NUMBER } if test_credentials?

        service_sid = ENV["APP_PATIENT_PORTAL_TWILIO_MESSAGING_SERVICE_SID"].presence
        return { "MessagingServiceSid" => service_sid } if service_sid&.match?(/\AMG\h{32}\z/)

        from = normalize_phone(ENV["APP_PATIENT_PORTAL_TWILIO_FROM_NUMBER"])
        from ? { "From" => from } : nil
      end

      def origin
        value = ENV["APP_PATIENT_PORTAL_RECOVERY_ORIGIN"].presence || ENV["APP_SITE_ORIGIN"].presence
        value ||= Rails.env.test? ? "https://example.com" : "http://localhost:3000" unless Rails.env.production?
        return unless value

        uri = URI.parse(value)
        exact_origin = uri.host.present? && uri.userinfo.nil? && uri.query.nil? && uri.fragment.nil? &&
          [ "", "/" ].include?(uri.path)
        secure = uri.is_a?(URI::HTTPS)
        local = uri.is_a?(URI::HTTP) && %w[localhost 127.0.0.1 ::1].include?(uri.host)
        uri if exact_origin && (secure || (!Rails.env.production? && local))
      rescue URI::InvalidURIError
        nil
      end

      def reset_url(token)
        "#{origin}/patient-portal/activate#token=#{ERB::Util.url_encode(token)}&purpose=recovery"
      end

      def normalize_phone(value)
        source = value.to_s.strip
        digits = source.gsub(/\D/, "")
        digits = "1#{digits}" if digits.length == 10
        return unless digits.length.between?(8, 15)

        "+#{digits}"
      end

      def test_credentials?
        !Rails.env.production? && ENV["APP_PATIENT_PORTAL_TWILIO_ACCOUNT_SID"].blank? &&
          test_account_sid.present? && ENV["TWILIO_TEST_AUTH_TOKEN"].present?
      end

      def test_account_sid
        ENV["TWILIO_TEST_ACCOUNT_SID"].presence unless Rails.env.production?
      end
      private_class_method :test_account_sid
    end
  end
end
