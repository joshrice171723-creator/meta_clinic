require "json"
require "net/http"

module Clinic
  module PatientPortal
    module RecoverySmsProvider
      module_function

      def deliver(to:, body:)
        return { status: :gated, failure_code: "provider_unconfigured" } unless RecoverySmsConfig.configured?

        account_sid = RecoverySmsConfig.account_sid
        uri = URI("https://api.twilio.com/2010-04-01/Accounts/#{account_sid}/Messages.json")
        request = Net::HTTP::Post.new(uri)
        request.basic_auth(RecoverySmsConfig.authentication_username, RecoverySmsConfig.authentication_secret)
        request.set_form_data({ "To" => to, "Body" => body }.merge(RecoverySmsConfig.sender_parameters))
        response = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true, open_timeout: 5, read_timeout: 10) do |http|
          http.request(request)
        end

        if response.code == "201"
          payload = JSON.parse(response.body)
          sid = payload.fetch("sid").to_s
          raise JSON::ParserError, "Twilio returned an invalid message reference." unless sid.match?(/\ASM\h{32}\z/)
          return { status: :accepted, provider_message_id: sid }
        end
        return { status: :unknown, failure_code: "provider_outcome_unknown" } if response.code.start_with?("5")

        { status: :failed, failure_code: response.code == "429" ? "provider_rate_limited" : "provider_rejected" }
      rescue JSON::ParserError, KeyError
        { status: :unknown, failure_code: "provider_response_invalid" }
      rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, IOError, SystemCallError
        { status: :unknown, failure_code: "provider_outcome_unknown" }
      end
    end
  end
end
