require "json"
require "net/http"

module Clinic
  module Reminders
    module Providers
      module Twilio
        module_function

        def send(reminder:, idempotency_key:)
          return { status: :gated } unless configured?

          uri = URI("https://api.twilio.com/2010-04-01/Accounts/#{account_sid}/Messages.json")
          request = Net::HTTP::Post.new(uri)
          request.basic_auth(api_key_sid, api_key_secret)
          request["Idempotency-Key"] = idempotency_key
          request.set_form_data({ "To" => reminder.communication_endpoint.value, "Body" => reminder.content }.merge(sender_parameters))
          response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 10) { |http| http.request(request) }

          return { status: :accepted, provider_message_id: JSON.parse(response.body).fetch("sid") } if response.code == "201"
          return { status: :outage } if response.code == "429" || response.code.start_with?("5")

          { status: :gated }
        rescue JSON::ParserError, KeyError
          { status: :unknown, failure_class: "provider_response_invalid" }
        rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, IOError, SystemCallError
          { status: :unknown, failure_class: "provider_outcome_unknown" }
        end

        def configured?
          account_sid&.match?(/\AAC\h{32}\z/) && api_key_sid.present? && api_key_secret.present? && sender_parameters.present?
        end

        def account_sid = ENV["APP_PLATFORM_TWILIO_ACCOUNT_SID"].presence
        def api_key_sid = ENV["APP_PLATFORM_TWILIO_API_KEY_SID"].presence
        def api_key_secret = ENV["APP_PLATFORM_TWILIO_API_KEY_SECRET"].presence

        def sender_parameters
          service_sid = ENV["APP_PLATFORM_TWILIO_MESSAGING_SERVICE_SID"].presence
          return { "MessagingServiceSid" => service_sid } if service_sid&.match?(/\AMG\h{32}\z/)

          from = Platform::ClinicOwnerInvitationSms.normalize_phone(ENV["APP_PLATFORM_TWILIO_FROM_NUMBER"])
          from ? { "From" => from } : nil
        end
      end
    end
  end
end
