require "net/http"

module Clinic
  module Reminders
    module Providers
      module TwilioTest
        TEST_FROM_NUMBER = "+15005550006"

        def self.send(reminder:, idempotency_key:)
          account_sid = ENV["TWILIO_TEST_ACCOUNT_SID"].to_s
          auth_token = ENV["TWILIO_TEST_AUTH_TOKEN"].to_s
          return { status: :gated } if account_sid.blank? || auth_token.blank?

          uri = URI("https://api.twilio.com/2010-04-01/Accounts/#{account_sid}/Messages.json")
          request = Net::HTTP::Post.new(uri)
          request.basic_auth(account_sid, auth_token)
          request["Idempotency-Key"] = idempotency_key
          request.set_form_data(
            "To" => reminder.communication_endpoint.value,
            "From" => TEST_FROM_NUMBER,
            "Body" => reminder.content
          )
          response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 10) do |http|
            http.request(request)
          end

          return { status: :accepted, provider_message_id: JSON.parse(response.body).fetch("sid") } if response.code == "201"
          return { status: :outage } if response.code == "429" || response.code.start_with?("5")

          { status: :gated }
        rescue JSON::ParserError, KeyError
          { status: :unknown, failure_class: "provider_response_invalid" }
        rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, IOError, SystemCallError
          { status: :unknown, failure_class: "provider_outcome_unknown" }
        end
      end
    end
  end
end
