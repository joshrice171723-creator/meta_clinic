require "openssl"

module Clinic
  module Billing
    class ProcessorWebhookVerifier
      class InvalidSignature < StandardError; end

      module Stripe
        module_function

        def verify!(raw_body:, signature_header:, secret:, now: Time.current, tolerance: 300)
          raise InvalidSignature, "Webhook signature verification failed." if raw_body.blank? || secret.blank?

          values = signature_header.to_s.split(",").each_with_object(Hash.new { |hash, key| hash[key] = [] }) do |part, result|
            key, value = part.split("=", 2)
            result[key] << value if key.present? && value.present?
          end
          timestamp = Integer(values.fetch("t").first)
          raise InvalidSignature, "Webhook signature verification failed." if (now.to_i - timestamp).abs > tolerance

          signed_payload = "#{timestamp}.#{raw_body}"
          expected = OpenSSL::HMAC.hexdigest(OpenSSL::Digest.new("SHA256"), secret, signed_payload)
          valid = values.fetch("v1", []).any? do |candidate|
            candidate.length == expected.length && ActiveSupport::SecurityUtils.secure_compare(candidate, expected)
          end
          raise InvalidSignature, "Webhook signature verification failed." unless valid

          true
        rescue KeyError, ArgumentError, TypeError
          raise InvalidSignature, "Webhook signature verification failed."
        end
      end
    end
  end
end
