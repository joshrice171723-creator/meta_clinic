require "json"
require "net/http"

module Platform
  module ClinicOwnerInvitationSms
    module_function

    def configured?
      ENV["APP_PLATFORM_INVITATION_SMS_ENABLED"] == "true" &&
        account_sid&.match?(/\AAC\h{32}\z/) && api_key_sid.present? && api_key_secret.present? &&
        sender_parameters.present?
    end

    def deliver(phone_number:, activation_path:, expires_at:)
      return false unless configured?

      destination = normalize_phone(phone_number)
      return false unless destination

      uri = URI("https://api.twilio.com/2010-04-01/Accounts/#{account_sid}/Messages.json")
      request = Net::HTTP::Post.new(uri)
      request.basic_auth(api_key_sid, api_key_secret)
      request.set_form_data({
        "To" => destination,
        "Body" => "Meta Clinic invitation: create your password at #{site_origin}#{activation_path} This link expires #{expires_at.strftime('%b %-d at %-l:%M %p %Z')} and can be used once."
      }.merge(sender_parameters))
      response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 10) do |http|
        http.request(request)
      end
      return false unless response.code == "201"

      JSON.parse(response.body).fetch("sid").to_s.match?(/\ASM\h{32}\z/)
    rescue JSON::ParserError, KeyError, Net::OpenTimeout, Net::ReadTimeout, SocketError, IOError, SystemCallError
      false
    end

    def normalize_phone(value)
      digits = value.to_s.gsub(/\D/, "")
      digits = "1#{digits}" if digits.length == 10
      return unless digits.length.between?(8, 15)

      "+#{digits}"
    end

    def account_sid
      ENV["APP_PLATFORM_TWILIO_ACCOUNT_SID"].presence
    end
    private_class_method :account_sid

    def api_key_sid
      ENV["APP_PLATFORM_TWILIO_API_KEY_SID"].presence
    end
    private_class_method :api_key_sid

    def api_key_secret
      ENV["APP_PLATFORM_TWILIO_API_KEY_SECRET"].presence
    end
    private_class_method :api_key_secret

    def sender_parameters
      service_sid = ENV["APP_PLATFORM_TWILIO_MESSAGING_SERVICE_SID"].presence
      return { "MessagingServiceSid" => service_sid } if service_sid&.match?(/\AMG\h{32}\z/)

      from = normalize_phone(ENV["APP_PLATFORM_TWILIO_FROM_NUMBER"])
      from ? { "From" => from } : nil
    end
    private_class_method :sender_parameters

    def site_origin
      ENV.fetch("APP_SITE_ORIGIN").delete_suffix("/")
    end
    private_class_method :site_origin
  end
end
