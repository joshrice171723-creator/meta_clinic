module Clinic
  module Telehealth
    module Providers
      class Unavailable < StandardError; end
      class Rejected < StandardError; end
      class NotFound < Rejected; end
      class Unsupported < StandardError; end

      module_function

      def fetch(code)
        case code.to_s
        when "daily" then Daily
        when "twilio" then Twilio
        else
          raise Unsupported, "The video provider is unsupported."
        end
      end
    end
  end
end
