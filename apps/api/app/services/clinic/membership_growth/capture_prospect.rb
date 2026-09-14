require "uri"

module Clinic
  module MembershipGrowth
    class CaptureProspect
      class Conflict < StandardError; end

      Result = Struct.new(:prospect, :replayed, keyword_init: true)

      def self.call(practice:, version_id:, selections:, display_name:, email_address:, phone_number: nil,
        source: nil, outreach_consent:, request_key:, intent_type: "outreach", preferred_contact_method: nil, preferred_contact_time: nil)
        new(practice:, version_id:, selections:, display_name:, email_address:, phone_number:,
          source:, outreach_consent:, request_key:, intent_type:, preferred_contact_method:, preferred_contact_time:).call
      end

      def initialize(practice:, version_id:, selections:, display_name:, email_address:, phone_number:,
        source:, outreach_consent:, request_key:, intent_type:, preferred_contact_method:, preferred_contact_time:)
        @practice = practice
        @version_id = positive_id(version_id, "Membership version")
        @selections = selections
        @display_name = required_text(display_name, "Name", 120)
        @email_address = normalize_email(email_address)
        @phone_number, @normalized_phone = normalize_phone(phone_number)
        raise ArgumentError, "Provide an email address or phone number." unless @email_address || @phone_number
        @source = optional_text(source, "Source", 80)
        @outreach_consent = boolean(outreach_consent, "Outreach consent")
        raise ArgumentError, "Confirm that the clinic may contact you about this request." unless @outreach_consent
        @intent_type = intent_type.to_s
        raise ArgumentError, "Choose purchase or clinic outreach." unless @intent_type.in?(%w[outreach purchase])
        raise ArgumentError, "Enter an email address to receive your receipt and set up the patient portal." if
          @intent_type == "purchase" && @email_address.nil?
        @request_key = Clinic::Care::SubscriptionDefinition.request_key(request_key)
        @contact_preferences = {}
        method = optional_text(preferred_contact_method, "Preferred contact method", 20)
        time = optional_text(preferred_contact_time, "Preferred contact time", 160)
        if method
          raise ArgumentError, "Choose email or phone for preferred contact." unless method.in?(%w[email phone])
          raise ArgumentError, "Provide the contact method you selected." if (method == "email" && @email_address.nil?) || (method == "phone" && @phone_number.nil?)
          @contact_preferences[:preferred_contact_method] = method
        end
        @contact_preferences[:preferred_contact_time] = time if time
      end

      def call
        ApplicationRecord.transaction do
          practice.lock!
          ensure_storefront_available!
          version, selected_terms = selected_quote
          email_digest = email_address && ContactDigest.call(practice_id: practice.id, value: email_address)
          phone_digest = normalized_phone && ContactDigest.call(practice_id: practice.id, value: normalized_phone)
          digest = request_digest(version:, selected_terms:, email_digest:, phone_digest:)
          prospect = MembershipProspect.find_or_initialize_by(practice_id: practice.id, request_key: request_key)
          created = prospect.new_record?
          if created
            prospect.assign_attributes(
              subscription_version: version,
              request_digest: digest,
              display_name: display_name,
              email_address: email_address,
              phone_number: phone_number,
              email_digest: email_digest,
              phone_digest: phone_digest,
              selected_terms: selected_terms,
              source: source,
              outreach_consent: outreach_consent,
              intent_type: intent_type,
              status: "new"
            )
            prospect.assign_attributes(@contact_preferences)
            prospect.save!
          end
          unless ActiveSupport::SecurityUtils.secure_compare(prospect.request_digest, digest)
            raise Conflict, "That request key was already used for different enrollment details."
          end

          Result.new(prospect: prospect, replayed: !created)
        end
      end

      private

      attr_reader :practice, :version_id, :selections, :display_name, :email_address,
        :phone_number, :normalized_phone, :source, :outreach_consent, :request_key
      attr_reader :intent_type

      def ensure_storefront_available!
        unless practice.membership_storefront_enabled? && practice.public_membership_slug.present? &&
            Clinic::DeploymentAccess.practice_enabled?(practice.id)
          raise ActiveRecord::RecordNotFound
        end
      end

      def selected_quote
        catalog_entry = Clinic::Care::SubscriptionProjection.catalog(practice: practice)
          .find { |entry| entry.fetch(:id) == version_id }
        raise ActiveRecord::RecordNotFound unless catalog_entry

        version = Clinic::Care::SubscriptionVersion.where(practice_id: practice.id).find(version_id)
        [ version, Clinic::Care::SubscriptionDefinition.select(version.snapshot, selections) ]
      end

      def request_digest(version:, selected_terms:, email_digest:, phone_digest:)
        Clinic::Care::SubscriptionDefinition.fingerprint(
          "version_id" => version.id,
          "selected_terms_digest" => Clinic::Care::SubscriptionDefinition.fingerprint(selected_terms),
          "display_name_digest" => ContactDigest.call(practice_id: practice.id, value: display_name.downcase),
          "email_digest" => email_digest,
          "phone_digest" => phone_digest,
          "source" => source,
          "outreach_consent" => outreach_consent,
          "intent_type" => intent_type,
          **@contact_preferences.transform_keys(&:to_s)
        )
      end

      def positive_id(value, label)
        text = value.to_s
        raise ArgumentError, "#{label} must be a positive integer." unless text.match?(/\A[1-9]\d*\z/)

        text.to_i
      end

      def required_text(value, label, maximum)
        text = value.to_s.strip
        raise ArgumentError, "#{label} is required and must be at most #{maximum} characters." if text.empty? || text.length > maximum

        text
      end

      def optional_text(value, label, maximum)
        return nil if value.nil?

        text = value.to_s.strip
        raise ArgumentError, "#{label} must be at most #{maximum} characters." if text.length > maximum

        text.presence
      end

      def normalize_email(value)
        email = optional_text(value, "Email address", 320)&.downcase
        return nil unless email

        raise ArgumentError, "Enter a valid email address." unless URI::MailTo::EMAIL_REGEXP.match?(email)

        email
      end

      def normalize_phone(value)
        text = optional_text(value, "Phone number", 40)
        return [ nil, nil ] unless text

        digits = text.scan(/\d/).join
        raise ArgumentError, "Enter a valid phone number." unless digits.length.between?(7, 15)

        [ text, digits ]
      end

      def boolean(value, label)
        raise ArgumentError, "#{label} must be true or false." unless [ true, false ].include?(value)

        value
      end
    end
  end
end
