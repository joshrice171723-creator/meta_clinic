require "openssl"

module Clinic
  module MembershipGrowth
    class ContactDigest
      DOMAIN = "meta-clinic/membership-growth-contact/v1".freeze

      def self.call(practice_id:, value:)
        normalized = value.to_s
        OpenSSL::HMAC.hexdigest("SHA256", tenant_key(practice_id), normalized)
      end

      def self.tenant_key(practice_id)
        root_key = Array(Rails.application.config.active_record.encryption.primary_key).last
        unless root_key.is_a?(String) && root_key.present?
          raise "Active Record encryption primary key is unavailable"
        end

        OpenSSL::HMAC.digest("SHA256", root_key, "#{DOMAIN}/practice/#{Integer(practice_id)}")
      end
      private_class_method :tenant_key
    end
  end
end
