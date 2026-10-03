require "uri"

module Clinic
  module PublicServices
    class CaptureInquiry
      class Conflict < StandardError; end
      Result = Struct.new(:inquiry, :replayed, keyword_init: true)

      def self.call(practice:, service_offering_id:, display_name:, email_address:, phone_number:,
        outreach_consent:, request_key:)
        name = display_name.to_s.strip
        email = email_address.to_s.strip.downcase.presence
        phone = phone_number.to_s.strip.presence
        key = request_key.to_s.strip
        raise ArgumentError, "Enter your name." if name.blank? || name.length > 120
        raise ArgumentError, "Enter a valid email address." if email && (email.length > 320 || !URI::MailTo::EMAIL_REGEXP.match?(email))
        raise ArgumentError, "Enter a valid phone number." if phone && (phone.length > 40 || !phone.scan(/\d/).length.between?(7, 15))
        raise ArgumentError, "Provide an email address or phone number." unless email || phone
        raise ArgumentError, "Confirm that the clinic may contact you about this service." unless outreach_consent == true
        raise ArgumentError, "A request key is required." unless /\A[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}\z/.match?(key)

        digest = Digest::SHA256.hexdigest(JSON.generate([ service_offering_id.to_i, name, email, phone, true ]))
        existing = practice.service_inquiries.find_by(request_key: key)
        return replay(existing, digest) if existing

        inquiry = ApplicationRecord.transaction do
          practice.lock!
          offering = practice.service_offerings.lock.find(service_offering_id)
          raise ActiveRecord::RecordNotFound unless offering.public_visible? && offering.available_for_new_work?

          practice.service_inquiries.create!(service_offering: offering, request_key: key,
            request_digest: digest, display_name: name, email_address: email, phone_number: phone,
            outreach_consent_at: Time.current)
        end
        Result.new(inquiry:, replayed: false)
      rescue ActiveRecord::RecordNotUnique
        replay(practice.service_inquiries.find_by!(request_key: key), digest)
      end

      def self.replay(existing, digest)
        raise Conflict, "That request key was already used for different inquiry details." unless existing.request_digest == digest

        Result.new(inquiry: existing, replayed: true)
      end
      private_class_method :replay
    end
  end
end
